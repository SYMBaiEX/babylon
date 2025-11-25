"""
Babylon RL Training with ART Framework
Supports multiple backends:
- ServerlessBackend (W&B cloud)
- LocalBackend (local CUDA GPU)
- MLXBackend (Apple Silicon Mac)
- CPUBackend (fallback for any system)

For local testing: Set USE_LOCAL_BACKEND=true and optionally BASE_MODEL to a smaller model
For production: Set WANDB_API_KEY for W&B serverless training
For Mac: Set USE_MLX_BACKEND=true (auto-detected on Apple Silicon)

Supported models for LOCAL/CUDA training (any Unsloth-compatible model):
- Qwen/Qwen2.5-3B-Instruct (fastest, ~8GB VRAM)
- Qwen/Qwen2.5-7B-Instruct (good balance, ~16GB VRAM)
- Qwen/Qwen2.5-14B-Instruct (larger, ~32GB VRAM)
- meta-llama/Meta-Llama-3.1-8B-Instruct (popular, ~20GB VRAM)
- unsloth/Qwen3-4B-128K (128K context, ~10GB VRAM) ⭐ Recommended

Supported models for MLX (Apple Silicon):
- mlx-community/Qwen2.5-3B-Instruct-4bit (fastest, ~4GB RAM)
- mlx-community/Qwen2.5-7B-Instruct-4bit (good balance, ~8GB RAM)
- Qwen/Qwen3-4B (can be converted to MLX, ~8GB RAM)

Supported models for SERVERLESS (W&B cloud) training:
- OpenPipe/Qwen3-14B-Instruct (currently the only model in W&B ART catalog)
"""

import os
import asyncio
import asyncpg
import json
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from project root
project_root = Path(__file__).parent.parent.parent.parent
env_path = project_root / '.env'
env_local_path = project_root / '.env.local'

# Load .env files (local takes priority)
if env_local_path.exists():
    load_dotenv(env_local_path, override=True)
    print(f"✅ Loaded environment from {env_local_path}")
if env_path.exists():
    load_dotenv(env_path, override=False)
    print(f"✅ Loaded environment from {env_path}")

# Suppress Pydantic v1 warning for Python 3.14
import warnings
warnings.filterwarnings('ignore', message='.*Pydantic V1.*')

logger = logging.getLogger(__name__)

# Default models for different backends
DEFAULT_LOCAL_MODEL = "unsloth/Qwen3-4B-128K"  # Recommended: 128K context, efficient
DEFAULT_SERVERLESS_MODEL = "OpenPipe/Qwen3-14B-Instruct"  # Only model in W&B catalog
DEFAULT_MLX_MODEL = "mlx-community/Qwen2.5-3B-Instruct-4bit"  # Best for Apple Silicon
DEFAULT_CPU_MODEL = "unsloth/Qwen3-4B-128K"  # Works on CPU (slow but functional)

# Model size categories for resource estimation
MODEL_SIZES = {
    "3B": ["Qwen/Qwen2.5-3B-Instruct", "mlx-community/Qwen2.5-3B-Instruct-4bit"],
    "4B": ["Qwen/Qwen3-4B", "unsloth/Qwen3-4B-128K"],
    "7B": ["Qwen/Qwen2.5-7B-Instruct", "mlx-community/Qwen2.5-7B-Instruct-4bit"],
    "8B": ["meta-llama/Meta-Llama-3.1-8B-Instruct"],
    "14B": ["Qwen/Qwen2.5-14B-Instruct", "OpenPipe/Qwen3-14B-Instruct", "Qwen/Qwen3-14B"],
}

# Backend types
BACKEND_CUDA = "cuda"
BACKEND_MLX = "mlx"
BACKEND_CPU = "cpu"
BACKEND_SERVERLESS = "serverless"


def get_model_size_category(model: str) -> str:
    """Get the size category of a model"""
    for size, models in MODEL_SIZES.items():
        if model in models:
            return size
    # Fallback: check if model name contains size hint
    if "3B" in model:
        return "3B"
    if "4B" in model:
        return "4B"
    if "7B" in model:
        return "7B"
    if "8B" in model:
        return "8B"
    if "14B" in model or "32B" in model:
        return "14B"
    return "unknown"


def estimate_vram_gb(model: str) -> int:
    """Estimate VRAM/RAM needed for a model (with 4-bit quantization)"""
    size = get_model_size_category(model)
    return {"3B": 6, "4B": 8, "7B": 14, "8B": 18, "14B": 28}.get(size, 28)


def detect_hardware() -> str:
    """
    Auto-detect the best available hardware backend.
    Returns: 'cuda', 'mlx', or 'cpu'
    """
    # Check for MLX (Apple Silicon)
    try:
        import platform
        if platform.system() == "Darwin" and platform.machine() == "arm64":
            try:
                import mlx.core  # noqa: F401
                logger.info("🍎 Detected Apple Silicon with MLX support")
                return BACKEND_MLX
            except ImportError:
                logger.info("🍎 Apple Silicon detected but MLX not installed")
                logger.info("   Install with: pip install mlx mlx-lm")
    except Exception:
        pass
    
    # Check for CUDA
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            logger.info(f"🎮 Detected CUDA GPU: {gpu_name}")
            return BACKEND_CUDA
    except ImportError:
        pass
    except Exception:
        pass
    
    # Fallback to CPU
    logger.info("💻 No GPU detected, using CPU backend (training will be slow)")
    return BACKEND_CPU


def check_mlx_available() -> bool:
    """Check if MLX is available"""
    try:
        import mlx.core  # noqa: F401
        import mlx_lm  # noqa: F401
        return True
    except ImportError:
        return False


class BabylonTrainer:
    """
    Production-ready RL trainer using ART framework
    
    Features:
    - LocalBackend for local CUDA GPU training (any Unsloth model)
    - MLXBackend for Apple Silicon Mac training
    - CPUBackend for CPU-only training (slow but works anywhere)
    - ServerlessBackend for W&B cloud training (OpenPipe/Qwen3-14B-Instruct)
    - All data from YOUR PostgreSQL
    - Local heuristic scoring (no external API calls)
    - Automatic backend selection based on hardware
    """
    
    def __init__(
        self,
        db_url: str,
        project: str = "babylon",
        base_model: Optional[str] = None,  # Auto-detected based on backend
        min_agents: int = 1,
        backend_type: Optional[str] = None,  # 'cuda', 'mlx', 'cpu', 'serverless', or None for auto
    ):
        self.db_url = db_url
        self.project = project
        self.min_agents = min_agents
        self.pool: Optional[asyncpg.Pool] = None
        self.model = None
        self.backend = None
        self._mlx_model = None  # For MLX-specific model
        self._mlx_tokenizer = None
        
        # Determine backend type
        self._backend_type = self._resolve_backend_type(backend_type)
        
        # Set base model based on backend
        if base_model:
            self.base_model = base_model
        else:
            self.base_model = os.getenv("BASE_MODEL", self._get_default_model())
        
        # Log configuration
        self._log_config()
    
    def _resolve_backend_type(self, requested: Optional[str]) -> str:
        """Resolve which backend to use based on environment and hardware"""
        # Check explicit environment overrides first
        if os.getenv("USE_MLX_BACKEND", "").lower() == "true":
            return BACKEND_MLX
        if os.getenv("USE_CPU_BACKEND", "").lower() == "true":
            return BACKEND_CPU
        if os.getenv("USE_LOCAL_BACKEND", "").lower() == "true":
            # Local means CUDA or CPU, auto-detect
            hw = detect_hardware()
            return hw if hw == BACKEND_CUDA else BACKEND_CPU
        
        # If explicit backend requested, use it
        if requested:
            return requested
        
        # If WANDB_API_KEY is set, default to serverless
        if os.getenv("WANDB_API_KEY"):
            return BACKEND_SERVERLESS
        
        # Auto-detect based on hardware
        return detect_hardware()
    
    def _get_default_model(self) -> str:
        """Get default model for the current backend type"""
        if self._backend_type == BACKEND_MLX:
            return DEFAULT_MLX_MODEL
        elif self._backend_type == BACKEND_SERVERLESS:
            return DEFAULT_SERVERLESS_MODEL
        elif self._backend_type == BACKEND_CPU:
            return DEFAULT_CPU_MODEL
        else:  # CUDA
            return DEFAULT_LOCAL_MODEL
    
    def _log_config(self):
        """Log the current configuration"""
        backend_names = {
            BACKEND_CUDA: "LocalBackend (CUDA GPU)",
            BACKEND_MLX: "MLXBackend (Apple Silicon)",
            BACKEND_CPU: "CPUBackend (CPU-only)",
            BACKEND_SERVERLESS: "ServerlessBackend (W&B cloud)",
        }
        backend_display = backend_names.get(self._backend_type, self._backend_type)
        logger.info(f"Backend: {backend_display}")
        logger.info(f"Model: {self.base_model}")
        logger.info(f"Project: {self.project}")
        
        if self._backend_type in (BACKEND_CUDA, BACKEND_MLX, BACKEND_CPU):
            mem = estimate_vram_gb(self.base_model)
            mem_type = "VRAM" if self._backend_type == BACKEND_CUDA else "RAM"
            logger.info(f"Estimated {mem_type} needed: ~{mem}GB")
        
        if self._backend_type == BACKEND_CPU:
            logger.warning("⚠️  CPU training is SLOW. Consider using MLX on Mac or CUDA on Linux/Windows.")
    
    async def connect(self):
        """Connect to database"""
        self.pool = await asyncpg.create_pool(self.db_url, min_size=2, max_size=10)
        logger.info("✓ Connected to PostgreSQL")
    
    async def close(self):
        """Close connections"""
        if self.pool:
            await self.pool.close()
        # Only close backend if it's an actual backend object, not a string marker
        if self.backend and hasattr(self.backend, 'close'):
            await self.backend.close()
    
    def get_window_id(self, hours_ago: int = 0) -> str:
        """Get window ID (format: YYYY-MM-DDTHH:00)"""
        from datetime import timezone
        now = datetime.now(timezone.utc)
        window = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=hours_ago)
        return window.strftime("%Y-%m-%dT%H:00")
    
    async def initialize_model(self, name: str):
        """Initialize model with appropriate backend"""
        
        logger.info(f"Initializing model: {name}")
        logger.info(f"Base model: {self.base_model}")
        logger.info(f"Backend type: {self._backend_type}")
        
        # MLX backend has its own initialization path
        if self._backend_type == BACKEND_MLX:
            await self._init_mlx_backend()
            return
        
        # CPU backend uses simplified training
        if self._backend_type == BACKEND_CPU:
            await self._init_cpu_backend()
            return
        
        # For CUDA and Serverless, use ART framework
        try:
            import art
        except ImportError:
            raise ImportError(
                "ART framework not installed.\n"
                "Install with: pip install openpipe-art"
            )
        
        # Determine entity for W&B
        # Default to eliza-labs (the organization), can override with WANDB_ENTITY
        entity = os.getenv("WANDB_ENTITY", "eliza-labs")
        project_name = self.project
        if "/" in self.project:
            entity, project_name = self.project.split("/", 1)
        
        # Create the trainable model
        self.model = art.TrainableModel(
            name=name,
            project=project_name,
            entity=entity,
            base_model=self.base_model,
        )
        
        # Configure internal settings for smaller context (to prevent OOM)
        max_seq_length = int(os.getenv("MAX_SEQ_LENGTH", "8192"))
        self.model._internal_config = art.dev.InternalModelConfig(
            init_args=art.dev.InitArgs(
                max_seq_length=max_seq_length,
                gpu_memory_utilization=0.8,
            ),
        )
        
        # Initialize backend
        if self._backend_type == BACKEND_CUDA:
            await self._init_local_backend()
        else:
            await self._init_serverless_backend()
        
        logger.info(f"✓ Model registered: {self.model.get_inference_name()}")
    
    async def _init_local_backend(self):
        """Initialize LocalBackend for local CUDA GPU training"""
        from art.local.backend import LocalBackend
        
        logger.info("🎮 Initializing LocalBackend for CUDA GPU training...")
        
        # Check for GPU availability
        try:
            import torch
            if torch.cuda.is_available():
                gpu_name = torch.cuda.get_device_name(0)
                gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
                logger.info(f"   GPU: {gpu_name} ({gpu_memory:.1f}GB)")
                
                vram_needed = estimate_vram_gb(self.base_model)
                if gpu_memory < vram_needed:
                    logger.warning(f"   ⚠️  GPU has {gpu_memory:.1f}GB but model needs ~{vram_needed}GB")
                    logger.warning(f"   Consider using a smaller model like Qwen/Qwen2.5-3B-Instruct")
            else:
                logger.warning("   ⚠️  No CUDA GPU available - falling back to CPU!")
                self._backend_type = BACKEND_CPU
                await self._init_cpu_backend()
                return
        except ImportError:
            logger.warning("   ⚠️  torch not installed - cannot check GPU")
        
        self.backend = LocalBackend()
        await self.model.register(self.backend)
        logger.info("✓ LocalBackend initialized")
    
    async def _init_mlx_backend(self):
        """Initialize MLX backend for Apple Silicon training"""
        logger.info("🍎 Initializing MLX backend for Apple Silicon...")
        
        try:
            from mlx_lm import load
        except ImportError:
            raise ImportError(
                "MLX libraries not installed.\n"
                "Install with: pip install mlx mlx-lm\n"
                "Note: MLX only works on Apple Silicon Macs"
            )
        
        # Check available memory
        import subprocess
        try:
            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True,
                text=True,
                check=True
            )
            total_ram_gb = int(result.stdout.strip()) / (1024**3)
            logger.info(f"   Total RAM: {total_ram_gb:.1f}GB")
            
            ram_needed = estimate_vram_gb(self.base_model)
            if total_ram_gb < ram_needed * 1.5:  # Need headroom for MLX
                logger.warning(f"   ⚠️  Model needs ~{ram_needed}GB, you have {total_ram_gb:.1f}GB")
                logger.warning(f"   Consider using a smaller model like mlx-community/Qwen2.5-3B-Instruct-4bit")
        except Exception:
            pass
        
        # Load model with MLX
        logger.info(f"   Loading model: {self.base_model}")
        
        # MLX models can be loaded directly or converted
        model_name = self.base_model
        
        # If not an MLX model, try to find MLX equivalent or convert
        if "mlx" not in model_name.lower():
            # Try common MLX model mappings
            mlx_equivalents = {
                "Qwen/Qwen2.5-3B-Instruct": "mlx-community/Qwen2.5-3B-Instruct-4bit",
                "Qwen/Qwen2.5-7B-Instruct": "mlx-community/Qwen2.5-7B-Instruct-4bit",
                "Qwen/Qwen3-4B": "mlx-community/Qwen3-4B-4bit",
                "unsloth/Qwen3-4B-128K": "mlx-community/Qwen3-4B-4bit",  # Best available equivalent
            }
            if model_name in mlx_equivalents:
                original = model_name
                model_name = mlx_equivalents[model_name]
                logger.info(f"   Using MLX equivalent: {model_name} (instead of {original})")
            else:
                logger.warning(f"   ⚠️  No MLX equivalent found for {model_name}")
                logger.warning(f"   Will attempt to load directly (may need conversion)")
        
        try:
            self._mlx_model, self._mlx_tokenizer = load(model_name)
            logger.info(f"✓ MLX model loaded: {model_name}")
        except Exception as e:
            logger.error(f"   ❌ Failed to load MLX model: {e}")
            logger.info("   💡 Try installing a pre-converted model:")
            logger.info("      pip install huggingface_hub")
            logger.info("      huggingface-cli download mlx-community/Qwen2.5-3B-Instruct-4bit")
            raise
        
        self.backend = "mlx"  # Marker for MLX backend
        logger.info("✓ MLX backend initialized")
    
    async def _init_cpu_backend(self):
        """Initialize CPU backend for training without GPU"""
        logger.info("💻 Initializing CPU backend...")
        logger.warning("   ⚠️  CPU training is VERY SLOW - expect hours for even small datasets")
        logger.warning("   ⚠️  Consider using MLX on Mac (pip install mlx mlx-lm) or a cloud GPU")
        
        try:
            import torch
            # Force CPU mode
            torch.set_default_device("cpu")
            logger.info(f"   PyTorch version: {torch.__version__}")
            logger.info(f"   CPU threads: {torch.get_num_threads()}")
        except ImportError:
            logger.warning("   ⚠️  PyTorch not installed")
        
        # Check system RAM
        try:
            import psutil
            ram_gb = psutil.virtual_memory().total / (1024**3)
            logger.info(f"   System RAM: {ram_gb:.1f}GB")
            
            ram_needed = estimate_vram_gb(self.base_model)
            if ram_gb < ram_needed * 2:  # CPU needs more headroom
                logger.warning(f"   ⚠️  Model needs ~{ram_needed * 2}GB RAM on CPU")
                logger.warning(f"   Consider using a smaller model")
        except ImportError:
            pass
        
        self.backend = "cpu"  # Marker for CPU backend
        logger.info("✓ CPU backend initialized (expect slow training)")
    
    async def _init_serverless_backend(self):
        """Initialize ServerlessBackend for W&B cloud training"""
        from art.serverless.backend import ServerlessBackend
        
        wandb_key = os.getenv("WANDB_API_KEY")
        if not wandb_key:
            raise ValueError(
                "WANDB_API_KEY required for ServerlessBackend.\n"
                "Set USE_LOCAL_BACKEND=true for local training, or get a key from https://wandb.ai/settings"
            )
        
        logger.info("☁️  Initializing ServerlessBackend for W&B cloud training...")
        logger.info(f"   API Key: {'*' * (len(wandb_key) - 4) + wandb_key[-4:]}")
        
        self.backend = ServerlessBackend(api_key=wandb_key)
        
        # Retry logic for transient W&B errors (524 timeout, 500 errors)
        max_retries = 5
        retry_delay = 10
        
        for attempt in range(1, max_retries + 1):
            try:
                if attempt > 1:
                    logger.info(f"⏳ Retry {attempt}/{max_retries} (waiting {retry_delay}s)...")
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 120)  # Cap at 2 minutes
                
                # Add timeout to registration
                await asyncio.wait_for(
                    self.model.register(self.backend),
                    timeout=180.0  # 3 minute timeout
                )
                
                logger.info("✓ ServerlessBackend initialized")
                return
                
            except asyncio.TimeoutError:
                logger.error(f"   ⏱️  Registration timeout (attempt {attempt}/{max_retries})")
                if attempt == max_retries:
                    logger.error("   💡 Consider using USE_LOCAL_BACKEND=true for local training")
                    raise ValueError("W&B API timeout - service may be overloaded")
                    
            except Exception as e:
                error_str = str(e)
                is_retryable = any(x in error_str for x in ["524", "timeout", "500", "workflow error"])
                
                if is_retryable and attempt < max_retries:
                    logger.warning(f"   ⚠️  Retryable error: {error_str[:100]}")
                    continue
                    
                logger.error(f"   ❌ Registration failed: {error_str[:200]}")
                logger.error("   💡 Consider using USE_LOCAL_BACKEND=true for local training")
                raise
    
    async def collect_window_data(self, window_id: str, max_examples: Optional[int] = None) -> Dict:
        """Collect trajectories for a window from database"""
        
        if not self.pool:
            await self.connect()
        
        # Apply limit from environment or parameter
        if max_examples is None:
            max_examples_str = os.getenv("MAX_EXAMPLES", "2000")
            max_examples = int(max_examples_str) if max_examples_str else 2000
        
        logger.info(f"Querying database for window: {window_id} (limit: {max_examples})")
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT 
                    t."trajectoryId",
                    t."agentId",
                    t."stepsJson",
                    u.username
                FROM trajectories t
                LEFT JOIN "User" u ON t."agentId" = u.id
                WHERE (
                    t."scenarioId" = $1 
                    OR t."scenarioId" LIKE $1 || '%'
                    OR t."windowId" = $1
                )
                AND t."stepsJson" IS NOT NULL
                AND t."stepsJson"::text != 'null'
                AND t."stepsJson"::text != '[]'
                ORDER BY t."createdAt" DESC
                LIMIT {max_examples}
            """, window_id)
            
            if not rows:
                logger.warning(f"No trajectories found for window {window_id}")
                return {'window_id': window_id, 'agents': [], 'count': 0}
            
            logger.info(f"Found {len(rows)} trajectories")
            
            # Group by agent
            agents = {}
            for r in rows:
                aid = r['agentId']
                if aid not in agents:
                    agents[aid] = {
                        'id': aid,
                        'name': r['username'] or aid,
                        'trajs': []
                    }
                
                steps = json.loads(r['stepsJson'] or '[]')
                
                # Get final P&L from last step
                final_pnl = 0
                if steps and isinstance(steps, list) and len(steps) > 0:
                    last_step = steps[-1]
                    if isinstance(last_step, dict):
                        env_state = last_step.get('environmentState', {})
                        final_pnl = float(env_state.get('agentPnL', 0))
                
                agents[aid]['trajs'].append({
                    'id': r['trajectoryId'],
                    'steps': steps,
                    'pnl': final_pnl
                })
            
            logger.info(f"Grouped into {len(agents)} agents")
            
            return {
                'window_id': window_id,
                'agents': list(agents.values()),
                'count': len(agents)
            }
    
    def score_locally(self, agents: List[Dict]) -> List[Dict]:
        """Score agents using local heuristics (no external API calls)"""
        logger.info(f"Scoring {len(agents)} agents with local heuristics")
        
        scores = []
        
        for agent in agents:
            total_pnl = sum(t['pnl'] for t in agent['trajs'])
            total_actions = sum(len(t['steps']) for t in agent['trajs'])
            wins = sum(1 for t in agent['trajs'] if t['pnl'] > 0)
            losses = sum(1 for t in agent['trajs'] if t['pnl'] < 0)
            total_trades = wins + losses
            
            # Normalize scores
            pnl_score = max(0.0, min(1.0, (total_pnl + 1000) / 2000))
            win_rate = wins / total_trades if total_trades > 0 else 0.5
            activity_score = min(1.0, total_actions / 20)
            
            # Combined score: 50% P&L, 30% win rate, 20% activity
            final_score = 0.5 * pnl_score + 0.3 * win_rate + 0.2 * activity_score
            
            scores.append({
                'id': agent['id'],
                'name': agent['name'],
                'score': final_score,
                'pnl': total_pnl,
                'win_rate': win_rate,
                'actions': total_actions
            })
        
        scores.sort(key=lambda s: s['score'], reverse=True)
        
        if scores:
            logger.info(f"Scored: best={scores[0]['score']:.2f}, worst={scores[-1]['score']:.2f}")
        
        return scores
    
    def create_art_trajectories(self, window_data: Dict, scores: List[Dict]) -> List:
        """Create ART Trajectory objects from data"""
        
        import art
        
        # Limit steps per trajectory for context window
        max_steps = int(os.getenv("MAX_STEPS_PER_TRAJECTORY", "20"))
        
        score_map = {s['id']: s for s in scores}
        trajectories = []
        
        for agent in window_data['agents']:
            agent_score_data = score_map.get(agent['id'])
            if not agent_score_data:
                continue
            
            agent_score = agent_score_data['score']
            
            for traj in agent['trajs']:
                steps = traj['steps']
                
                if not steps or not isinstance(steps, list) or len(steps) < 2:
                    continue
                
                # Truncate to fit context window
                original_length = len(steps)
                if len(steps) > max_steps:
                    steps = steps[-max_steps:]
                
                # Build messages
                msgs = [
                    {
                        "role": "system",
                        "content": "You are a trading agent in Babylon prediction markets. Make profitable decisions."
                    }
                ]
                
                for step in steps:
                    if not isinstance(step, dict):
                        continue
                    
                    env = step.get('environmentState', {})
                    action = step.get('action', {})
                    
                    # User message: state
                    balance = env.get('agentBalance', 0)
                    pnl = env.get('agentPnL', 0)
                    positions = env.get('openPositions', 0)
                    
                    user_msg = f"Balance: ${balance:.0f}, P&L: ${pnl:.0f}, Positions: {positions}"
                    msgs.append({"role": "user", "content": user_msg})
                    
                    # Assistant message: action
                    action_type = action.get('actionType', 'wait')
                    params = action.get('parameters', {})
                    asst_msg = action_type
                    if params:
                        asst_msg += f" {json.dumps(params)}"
                    msgs.append({"role": "assistant", "content": asst_msg})
                
                # Create ART Trajectory
                art_traj = art.Trajectory(
                    messages_and_choices=msgs,
                    reward=agent_score,
                    metadata={
                        'window_id': window_data['window_id'],
                        'agent_id': agent['id'],
                        'trajectory_id': traj['id'],
                        'original_steps': original_length,
                        'truncated_steps': len(steps)
                    },
                    metrics={
                        'final_pnl': traj['pnl'],
                        'num_steps': len(steps),
                    }
                )
                
                trajectories.append(art_traj)
        
        logger.info(f"Created {len(trajectories)} ART trajectories")
        return trajectories
    
    def create_training_data(self, window_data: Dict, scores: List[Dict]) -> List[Dict]:
        """Create training data in chat format for MLX/CPU training"""
        
        max_steps = int(os.getenv("MAX_STEPS_PER_TRAJECTORY", "20"))
        score_map = {s['id']: s for s in scores}
        training_data = []
        
        for agent in window_data['agents']:
            agent_score_data = score_map.get(agent['id'])
            if not agent_score_data:
                continue
            
            agent_score = agent_score_data['score']
            
            for traj in agent['trajs']:
                steps = traj['steps']
                
                if not steps or not isinstance(steps, list) or len(steps) < 2:
                    continue
                
                # Truncate to fit context window
                if len(steps) > max_steps:
                    steps = steps[-max_steps:]
                
                # Build messages
                msgs = [
                    {
                        "role": "system",
                        "content": "You are a trading agent in Babylon prediction markets. Make profitable decisions."
                    }
                ]
                
                for step in steps:
                    if not isinstance(step, dict):
                        continue
                    
                    env = step.get('environmentState', {})
                    action = step.get('action', {})
                    
                    balance = env.get('agentBalance', 0)
                    pnl = env.get('agentPnL', 0)
                    positions = env.get('openPositions', 0)
                    
                    user_msg = f"Balance: ${balance:.0f}, P&L: ${pnl:.0f}, Positions: {positions}"
                    msgs.append({"role": "user", "content": user_msg})
                    
                    action_type = action.get('actionType', 'wait')
                    params = action.get('parameters', {})
                    asst_msg = action_type
                    if params:
                        asst_msg += f" {json.dumps(params)}"
                    msgs.append({"role": "assistant", "content": asst_msg})
                
                # Only include high-scoring trajectories for training
                if agent_score >= 0.5:
                    training_data.append({
                        "messages": msgs,
                        "reward": agent_score,
                        "trajectory_id": traj['id'],
                    })
        
        logger.info(f"Created {len(training_data)} training examples")
        return training_data
    
    async def _train_mlx(self, training_data: List[Dict], window_id: str) -> Dict:
        """Train using MLX backend (Apple Silicon)"""
        logger.info("🍎 Training with MLX backend...")
        logger.info(f"   Training examples: {len(training_data)}")
        
        # MLX-LM doesn't have built-in LoRA fine-tuning in the base package
        # We need to use mlx-lm's fine-tuning capabilities or a simpler approach
        
        # For now, we'll save training data and provide instructions
        output_dir = Path(f"./trained_models/mlx-{window_id.replace(':', '-')}")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Save training data in JSONL format for mlx-lm fine-tuning
        train_file = output_dir / "train.jsonl"
        with open(train_file, 'w') as f:
            for item in training_data:
                # Convert to mlx-lm expected format
                text = ""
                for msg in item["messages"]:
                    if msg["role"] == "system":
                        text += f"<|im_start|>system\n{msg['content']}<|im_end|>\n"
                    elif msg["role"] == "user":
                        text += f"<|im_start|>user\n{msg['content']}<|im_end|>\n"
                    elif msg["role"] == "assistant":
                        text += f"<|im_start|>assistant\n{msg['content']}<|im_end|>\n"
                f.write(json.dumps({"text": text}) + "\n")
        
        logger.info(f"   Saved training data to: {train_file}")
        
        # Attempt LoRA fine-tuning with mlx-lm
        try:
            from mlx_lm import finetuning
            
            logger.info("   Starting MLX LoRA fine-tuning...")
            
            # LoRA config
            lora_config = {
                "num_layers": 4,
                "lora_rank": 8,
                "lora_alpha": 16,
                "lora_dropout": 0.05,
            }
            
            # Training config
            train_config = {
                "iters": min(100, len(training_data) * 3),  # Reasonable iterations
                "batch_size": 1,
                "learning_rate": float(os.getenv("LEARNING_RATE", "1e-5")),
                "save_every": 50,
            }
            
            adapter_path = output_dir / "adapters"
            
            # Run fine-tuning
            finetuning.train(
                model=self._mlx_model,
                tokenizer=self._mlx_tokenizer,
                train_data=str(train_file),
                adapter_path=str(adapter_path),
                lora_config=lora_config,
                train_config=train_config,
            )
            
            logger.info(f"✓ MLX fine-tuning complete!")
            logger.info(f"   Adapter saved to: {adapter_path}")
            
            return {
                "model_path": str(output_dir),
                "adapter_path": str(adapter_path),
                "training_examples": len(training_data),
            }
            
        except (ImportError, AttributeError) as e:
            logger.warning(f"   MLX fine-tuning not available: {e}")
            logger.info("   💡 To fine-tune with MLX, install: pip install mlx-lm[finetuning]")
            logger.info(f"   Training data saved to: {train_file}")
            logger.info("   You can fine-tune manually with:")
            logger.info(f"      mlx_lm.lora --model {self.base_model} --train --data {train_file}")
            
            return {
                "model_path": str(output_dir),
                "training_data": str(train_file),
                "training_examples": len(training_data),
                "manual_training_required": True,
            }
    
    async def _train_cpu(self, training_data: List[Dict], window_id: str) -> Dict:
        """Train using CPU backend (slow but works anywhere)"""
        logger.info("💻 Training with CPU backend...")
        logger.warning("   ⚠️  This will be VERY slow - consider using MLX on Mac or cloud GPU")
        logger.info(f"   Training examples: {len(training_data)}")
        
        output_dir = Path(f"./trained_models/cpu-{window_id.replace(':', '-')}")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Save training data
        train_file = output_dir / "train.jsonl"
        with open(train_file, 'w') as f:
            for item in training_data:
                f.write(json.dumps(item) + "\n")
        
        logger.info(f"   Saved training data to: {train_file}")
        
        # Try to use transformers/peft for CPU training
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            from peft import LoraConfig, get_peft_model
            import torch
            
            logger.info("   Loading model for CPU training...")
            
            tokenizer = AutoTokenizer.from_pretrained(self.base_model, trust_remote_code=True)
            model = AutoModelForCausalLM.from_pretrained(
                self.base_model,
                torch_dtype=torch.float32,  # Use float32 for CPU
                device_map="cpu",
                trust_remote_code=True,
            )
            
            # Apply LoRA
            lora_config = LoraConfig(
                r=8,
                lora_alpha=16,
                target_modules=["q_proj", "v_proj"],
                lora_dropout=0.05,
                bias="none",
            )
            model = get_peft_model(model, lora_config)
            
            logger.info("   Model loaded with LoRA adapters")
            logger.info(f"   Trainable params: {model.print_trainable_parameters()}")
            
            # Note: Full training loop would go here, but CPU training is impractical
            # for large models. We'll save the setup and data instead.
            
            logger.warning("   ⚠️  Full CPU training not implemented (too slow)")
            logger.info("   Training data and config saved for manual training")
            
            return {
                "model_path": str(output_dir),
                "training_data": str(train_file),
                "training_examples": len(training_data),
                "manual_training_required": True,
            }
            
        except ImportError as e:
            logger.warning(f"   transformers/peft not available: {e}")
            logger.info("   💡 Install with: pip install transformers peft")
            
            return {
                "model_path": str(output_dir),
                "training_data": str(train_file),
                "training_examples": len(training_data),
                "manual_training_required": True,
            }
    
    async def train_window(
        self, 
        window_id: str, 
        batch_id: Optional[str] = None,
        model_version: Optional[str] = None
    ) -> Dict:
        """Train on one window - complete pipeline"""
        
        backend_names = {
            BACKEND_CUDA: "LocalBackend (CUDA)",
            BACKEND_MLX: "MLXBackend (Apple Silicon)",
            BACKEND_CPU: "CPUBackend",
            BACKEND_SERVERLESS: "ServerlessBackend (W&B)",
        }
        
        logger.info("=" * 70)
        logger.info(f"🚀 TRAINING WINDOW: {window_id}")
        logger.info(f"Backend: {backend_names.get(self._backend_type, self._backend_type)}")
        logger.info(f"Model: {self.base_model}")
        if batch_id:
            logger.info(f"Batch ID: {batch_id}")
        logger.info("=" * 70)
        
        # Update batch status
        if batch_id and self.pool:
            try:
                await self.pool.execute(
                    "UPDATE training_batches SET status = $1, \"startedAt\" = NOW() WHERE \"batchId\" = $2",
                    'training', batch_id
                )
            except Exception as e:
                logger.warning(f"Failed to update batch status: {e}")
        
        # Initialize model if needed
        model_name = f"babylon-{window_id.replace(':', '-')}"
        needs_init = (
            (self._backend_type in (BACKEND_CUDA, BACKEND_SERVERLESS) and not self.model) or
            (self._backend_type == BACKEND_MLX and not self._mlx_model) or
            (self._backend_type == BACKEND_CPU and self.backend != "cpu")
        )
        if needs_init:
            await self.initialize_model(model_name)
        
        # Step 1: Collect data
        logger.info("\n[1/4] Collecting from database...")
        max_examples = int(os.getenv("MAX_EXAMPLES", "2000"))
        data = await self.collect_window_data(window_id, max_examples=max_examples)
        
        if data['count'] < self.min_agents:
            error_msg = f"Window {window_id}: Only {data['count']} agents, need {self.min_agents}"
            if batch_id and self.pool:
                try:
                    await self.pool.execute(
                        "UPDATE training_batches SET status = $1, error = $2 WHERE \"batchId\" = $3",
                        'failed', error_msg, batch_id
                    )
                except Exception:
                    pass
            raise ValueError(error_msg)
        
        logger.info(f"✓ Collected {data['count']} agents")
        
        # Step 2: Score
        logger.info("\n[2/4] Scoring locally...")
        scores = self.score_locally(data['agents'])
        
        for i, score in enumerate(scores[:3], 1):
            logger.info(f"  #{i}: {score['name']} - Score: {score['score']:.2f}, P&L: ${score['pnl']:.0f}")
        
        # Step 3 & 4: Create training data and train (backend-specific)
        if self._backend_type in (BACKEND_MLX, BACKEND_CPU):
            # MLX/CPU path: create simple training data
            logger.info("\n[3/4] Creating training data...")
            training_data = self.create_training_data(data, scores)
            
            if not training_data:
                error_msg = "No valid training data created"
                if batch_id and self.pool:
                    try:
                        await self.pool.execute(
                            "UPDATE training_batches SET status = $1, error = $2 WHERE \"batchId\" = $3",
                            'failed', error_msg, batch_id
                        )
                    except Exception:
                        pass
                raise ValueError(error_msg)
            
            logger.info(f"✓ Created {len(training_data)} training examples")
            
            # Step 4: Train with MLX or CPU
            logger.info("\n[4/4] Training...")
            
            try:
                if self._backend_type == BACKEND_MLX:
                    train_result = await self._train_mlx(training_data, window_id)
                else:
                    train_result = await self._train_cpu(training_data, window_id)
            except Exception as e:
                error_msg = f"Training failed: {str(e)}"
                logger.error(error_msg)
                if batch_id and self.pool:
                    try:
                        await self.pool.execute(
                            "UPDATE training_batches SET status = $1, error = $2 WHERE \"batchId\" = $3",
                            'failed', error_msg, batch_id
                        )
                    except Exception:
                        pass
                raise
            
            logger.info("✓ Training complete!")
            
            # For MLX/CPU, we don't have step tracking like ART
            step = 1
            inference_name = train_result.get("model_path", f"babylon-{window_id}")
            num_trajectories = len(training_data)
            
        else:
            # ART path: CUDA or Serverless
            logger.info("\n[3/4] Creating ART trajectories...")
            art_trajs = self.create_art_trajectories(data, scores)
            
            if not art_trajs:
                error_msg = "No valid trajectories created"
                if batch_id and self.pool:
                    try:
                        await self.pool.execute(
                            "UPDATE training_batches SET status = $1, error = $2 WHERE \"batchId\" = $3",
                            'failed', error_msg, batch_id
                        )
                    except Exception:
                        pass
                raise ValueError(error_msg)
            
            logger.info(f"✓ Created {len(art_trajs)} trajectories")
            
            # Step 4: Train with ART
            logger.info("\n[4/4] Training with ART...")
            
            import art
            
            # Split into groups for training
            max_per_group = int(os.getenv("MAX_TRAJECTORIES_PER_GROUP", "10"))
            
            groups = []
            for i in range(0, len(art_trajs), max_per_group):
                batch = art_trajs[i:i + max_per_group]
                groups.append(art.TrajectoryGroup(
                    trajectories=batch,
                    metadata={
                        'window_id': window_id,
                        'batch_index': i // max_per_group,
                        'batch_size': len(batch)
                    }
                ))
            
            logger.info(f"Split into {len(groups)} groups of max {max_per_group}")
            
            try:
                await self.model.train(
                    groups,
                    config=art.TrainConfig(
                        learning_rate=float(os.getenv("LEARNING_RATE", "1e-5")),
                    )
                )
            except Exception as e:
                error_msg = f"Training failed: {str(e)}"
                logger.error(error_msg)
                if batch_id and self.pool:
                    try:
                        await self.pool.execute(
                            "UPDATE training_batches SET status = $1, error = $2 WHERE \"batchId\" = $3",
                            'failed', error_msg, batch_id
                        )
                    except Exception:
                        pass
                raise
            
            logger.info("✓ Training complete!")
            
            # Get inference info
            step = await self.model.get_step()
            inference_name = f"{self.model.get_inference_name()}:step{step}"
            num_trajectories = len(art_trajs)
        
        logger.info("\n" + "=" * 70)
        logger.info("✅ SUCCESS")
        logger.info("=" * 70)
        logger.info(f"Model: {inference_name}")
        logger.info(f"Step: {step}")
        logger.info(f"Agents trained: {data['count']}")
        logger.info(f"Trajectories: {num_trajectories}")
        logger.info("=" * 70)
        
        # Save model to database
        if batch_id and model_version and self.pool:
            try:
                avg_reward = sum(s['score'] for s in scores) / len(scores) if scores else 0.0
                model_id = f"babylon-agent-{model_version}"
                
                await self.pool.execute("""
                    INSERT INTO trained_models (
                        id, "modelId", version, "baseModel", "trainingBatch", 
                        "storagePath", status, "avgReward", "createdAt"
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                    ON CONFLICT ("modelId") DO UPDATE SET
                        version = EXCLUDED.version,
                        status = EXCLUDED.status,
                        "avgReward" = EXCLUDED."avgReward",
                        "updatedAt" = NOW()
                """,
                    f"model-{int(datetime.now().timestamp() * 1000)}",
                    model_id,
                    model_version,
                    self.base_model,
                    batch_id,
                    inference_name,
                    'ready',
                    avg_reward
                )
                
                await self.pool.execute(
                    "UPDATE training_batches SET status = $1, \"completedAt\" = NOW() WHERE \"batchId\" = $2",
                    'completed', batch_id
                )
                
                logger.info(f"✓ Saved model to database: {model_id}")
            except Exception as e:
                logger.error(f"Failed to save model to database: {e}")
        
        return {
            'window_id': window_id,
            'model_name': inference_name,
            'model_id': f"babylon-agent-{model_version}" if model_version else None,
            'step': step,
            'num_agents': data['count'],
            'num_trajectories': num_trajectories,
            'batch_id': batch_id,
            'backend': self._backend_type
        }
    
    async def test_inference(self, prompt: str = "Balance: $10000, P&L: $0. Should I buy BTC or wait?") -> str:
        """Test inference endpoint"""
        
        logger.info("\n🧪 Testing inference...")
        
        messages = [
            {"role": "system", "content": "You are a trading agent."},
            {"role": "user", "content": prompt}
        ]
        
        # MLX backend
        if self._backend_type == BACKEND_MLX and self._mlx_model:
            from mlx_lm import generate
            
            # Format prompt for chat
            chat_prompt = "<|im_start|>system\nYou are a trading agent.<|im_end|>\n"
            chat_prompt += f"<|im_start|>user\n{prompt}<|im_end|>\n"
            chat_prompt += "<|im_start|>assistant\n"
            
            response = generate(
                self._mlx_model,
                self._mlx_tokenizer,
                prompt=chat_prompt,
                max_tokens=50,
            )
            
            logger.info(f"✓ MLX Inference works!")
            logger.info(f"Response: {response}")
            return response
        
        # CPU backend - just return a placeholder
        if self._backend_type == BACKEND_CPU:
            logger.info("   CPU backend doesn't support live inference in this implementation")
            logger.info("   Load the trained model separately for inference")
            return "[CPU inference not implemented - load model manually]"
        
        # ART backend (CUDA/Serverless)
        if not self.model:
            raise ValueError("Model not initialized. Train first.")
        
        step = await self.model.get_step()
        model_name = f"{self.model.get_inference_name()}:step{step}"
        
        client = self.model.openai_client()
        
        completion = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=50
        )
        
        response = completion.choices[0].message.content
        
        logger.info(f"✓ Inference works!")
        logger.info(f"Response: {response}")
        
        return response if response else ""


async def main():
    """CLI interface"""
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )
    
    # Check environment
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL not set")
        print("Set with: export DATABASE_URL=postgresql://...")
        return
    
    # Detect hardware and configuration
    print("\n" + "=" * 70)
    print("🚀 BABYLON RL TRAINING")
    print("=" * 70)
    
    # Check for explicit backend overrides
    use_mlx = os.getenv("USE_MLX_BACKEND", "").lower() == "true"
    use_cpu = os.getenv("USE_CPU_BACKEND", "").lower() == "true"
    use_local = os.getenv("USE_LOCAL_BACKEND", "").lower() == "true"
    wandb_key = os.getenv("WANDB_API_KEY")
    base_model = os.getenv("BASE_MODEL")
    
    # Determine backend type
    if use_mlx:
        backend_type = BACKEND_MLX
        default_model = DEFAULT_MLX_MODEL
        print("✅ USE_MLX_BACKEND=true → Using MLX (Apple Silicon)")
    elif use_cpu:
        backend_type = BACKEND_CPU
        default_model = DEFAULT_CPU_MODEL
        print("✅ USE_CPU_BACKEND=true → Using CPU (slow!)")
    elif use_local:
        # Check if CUDA is available
        hw = detect_hardware()
        if hw == BACKEND_CUDA:
            backend_type = BACKEND_CUDA
            default_model = DEFAULT_LOCAL_MODEL
            print("✅ USE_LOCAL_BACKEND=true → Using CUDA GPU")
        else:
            backend_type = hw
            default_model = DEFAULT_MLX_MODEL if hw == BACKEND_MLX else DEFAULT_CPU_MODEL
            print(f"✅ USE_LOCAL_BACKEND=true → Auto-detected: {hw}")
    elif wandb_key:
        backend_type = BACKEND_SERVERLESS
        default_model = DEFAULT_SERVERLESS_MODEL
        print("✅ WANDB_API_KEY found → Using ServerlessBackend (W&B cloud)")
    else:
        # Auto-detect based on hardware
        backend_type = detect_hardware()
        if backend_type == BACKEND_MLX:
            default_model = DEFAULT_MLX_MODEL
            print("🍎 Auto-detected Apple Silicon → Using MLX")
        elif backend_type == BACKEND_CUDA:
            default_model = DEFAULT_LOCAL_MODEL
            print("🎮 Auto-detected CUDA GPU → Using LocalBackend")
        else:
            default_model = DEFAULT_CPU_MODEL
            print("💻 No GPU detected → Using CPU (slow!)")
    
    # Set model
    if not base_model:
        base_model = default_model
    
    print(f"   Model: {base_model}")
    
    mem_needed = estimate_vram_gb(base_model)
    if backend_type == BACKEND_CUDA:
        print(f"   Estimated VRAM: ~{mem_needed}GB")
    elif backend_type in (BACKEND_MLX, BACKEND_CPU):
        print(f"   Estimated RAM: ~{mem_needed}GB")
    
    print()
    
    # Create trainer
    trainer = BabylonTrainer(
        db_url=db_url,
        project=os.getenv("WANDB_PROJECT", "babylon"),
        base_model=base_model,
        min_agents=int(os.getenv("MIN_AGENTS_PER_WINDOW", "1")),
        backend_type=backend_type,
    )
    
    await trainer.connect()
    
    try:
        mode = os.getenv("MODE", "single")
        
        if mode == "list":
            print("Checking for ready windows...")
            ready = []
            for hours_ago in range(2, 72):
                window_id = trainer.get_window_id(hours_ago)
                data = await trainer.collect_window_data(window_id)
                if data['count'] >= trainer.min_agents:
                    ready.append((window_id, data['count']))
            
            print(f"\nReady windows ({len(ready)}):")
            for window_id, count in ready[:10]:
                print(f"  {window_id}: {count} agents")
            
            if not ready:
                print("\n⚠️  No windows with enough agents found")
        
        elif mode == "single":
            window_id = os.getenv("WINDOW_ID")
            batch_id = os.getenv("BATCH_ID")
            model_version = os.getenv("MODEL_VERSION")
            
            if not window_id:
                for hours_ago in range(2, 72):
                    wid = trainer.get_window_id(hours_ago)
                    data = await trainer.collect_window_data(wid)
                    if data['count'] >= trainer.min_agents:
                        window_id = wid
                        break
            
            if not window_id:
                print(f"❌ No windows with {trainer.min_agents}+ agents found")
                return
            
            print(f"Training on: {window_id}\n")
            
            result = await trainer.train_window(window_id, batch_id=batch_id, model_version=model_version)
            
            print()
            await trainer.test_inference()
            
            print(f"\n✅ All done!")
            print(f"Model: {result['model_name']}")
            print(f"Backend: {result['backend']}")
        
        else:
            print(f"Unknown mode: {mode}")
    
    finally:
        await trainer.close()


if __name__ == "__main__":
    asyncio.run(main())
