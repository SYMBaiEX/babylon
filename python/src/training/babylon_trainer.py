"""
Babylon RL Training with ART ServerlessBackend
TESTED AND WORKING - Following ART's proven pattern

All data from YOUR PostgreSQL, local scoring, W&B or local training
"""

import os
import asyncio
import asyncpg
import json
from typing import List, Dict, Any, Optional
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
    load_dotenv(env_path, override=False)  # Don't override .env.local
    print(f"✅ Loaded environment from {env_path}")

# Verify critical environment variables
if os.getenv('WANDB_API_KEY'):
    print(f"✅ WANDB_API_KEY found ({len(os.getenv('WANDB_API_KEY'))} chars)")
    print("   Training will use W&B serverless remote infrastructure")
else:
    train_local = os.getenv('TRAIN_RL_LOCAL', 'false').lower() == 'true'
    if train_local:
        print("⚠️  WANDB_API_KEY not found, but TRAIN_RL_LOCAL=true")
        print("   Note: ART ServerlessBackend still requires WANDB_API_KEY")
        print("   Even 'local' training uses W&B infrastructure")
    else:
        print("⚠️  WANDB_API_KEY not found")
        print("   Set WANDB_API_KEY for remote training (recommended)")
        print("   Or set TRAIN_RL_LOCAL=true for local (still requires WANDB_API_KEY)")
        print("   Get your key from: https://wandb.ai/settings")

if os.getenv('DATABASE_URL'):
    db_url_preview = os.getenv('DATABASE_URL', '')[:50]
    print(f"✅ DATABASE_URL found: {db_url_preview}...")
else:
    print("❌ DATABASE_URL not found")

# Suppress Pydantic v1 warning for Python 3.14
import warnings
warnings.filterwarnings('ignore', message='.*Pydantic V1.*')

logger = logging.getLogger(__name__)


class BabylonTrainer:
    """
    Production-ready RL trainer using ART framework
    
    Features:
    - ServerlessBackend (W&B if WANDB_API_KEY, else local GPU)
    - All data from YOUR PostgreSQL
    - Local heuristic scoring (no OpenPipe)
    - Automatic inference
    """
    
    def __init__(
        self,
        db_url: str,
        project: str = "babylon",
        base_model: str = "OpenPipe/Qwen3-14B-Instruct",  # ONLY model available in W&B ART
        min_agents: int = 1  # Lowered to 1 - always train even with minimal data
    ):
        self.db_url = db_url
        # CRITICAL: Auto-detect entity from W&B API to avoid permissions issues
        # If project doesn't contain entity, prepend user's personal entity
        if "/" not in project:
            entity = os.getenv("WANDB_ENTITY")
            if not entity and os.getenv("WANDB_API_KEY"):
                try:
                    import wandb
                    # Get entity from API first (before any init calls)
                    wandb.login(key=os.getenv("WANDB_API_KEY"))
                    api = wandb.Api()
                    entity = api.viewer.username  # Use personal account (has write access)
                    logger.info(f"Auto-detected W&B entity: {entity} (from API)")
                except Exception as e:
                    logger.warning(f"Could not auto-detect entity: {e}")
                    entity = None
            if entity:
                self.project = f"{entity}/{project}"
            else:
                self.project = project
        else:
            # If project contains entity, check if it's the org (which may not have write access)
            parts = project.split("/", 1)
            if len(parts) == 2:
                entity_part, project_part = parts
                # If entity is an org and we have API key, try to use personal account instead
                if entity_part and os.getenv("WANDB_API_KEY"):
                    try:
                        import wandb
                        wandb.login(key=os.getenv("WANDB_API_KEY"))
                        api = wandb.Api()
                        personal_entity = api.viewer.username
                        # Use personal account if different from org
                        if personal_entity != entity_part:
                            logger.info(f"Switching from org '{entity_part}' to personal account '{personal_entity}'")
                            self.project = f"{personal_entity}/{project_part}"
                        else:
                            self.project = project
                    except Exception:
                        self.project = project
            else:
                self.project = project
        self.base_model = base_model
        self.min_agents = min_agents
        self.pool: Optional[asyncpg.Pool] = None
        self.model = None
        self.backend = None
    
    async def connect(self):
        """Connect to database"""
        self.pool = await asyncpg.create_pool(self.db_url, min_size=2, max_size=10)
        logger.info("✓ Connected to PostgreSQL")
    
    async def close(self):
        """Close connections"""
        if self.pool:
            await self.pool.close()
        # Clean up wandb run if we created one
        if hasattr(self, '_wandb_run') and self._wandb_run:
            try:
                import wandb
                self._wandb_run.finish()
            except:
                pass
    
    def get_window_id(self, hours_ago: int = 0) -> str:
        """Get window ID (format: YYYY-MM-DDTHH:00)"""
        from datetime import timezone
        now = datetime.now(timezone.utc)
        window = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=hours_ago)
        return window.strftime("%Y-%m-%dT%H:00")
    
    async def initialize_model(self, name: str):
        """Initialize ART model with ServerlessBackend"""
        
        try:
            import art
            from art.serverless.backend import ServerlessBackend
        except ImportError:
            raise ImportError(
                "ART framework not installed.\n"
                "Install with: pip install openpipe-art==0.5.1"
            )
        
        logger.info(f"Initializing model: {name}")
        
        # CRITICAL: Extract entity and project separately to avoid permissions issues
        # Always use personal account (has write access) instead of org
        # Orgs may not have "models write access" permission
        if "/" in self.project:
            entity, project_name = self.project.split("/", 1)
        else:
            project_name = self.project
            env_entity = os.getenv("WANDB_ENTITY")
            
            # CRITICAL: Always detect personal account from API (has write access)
            # Even if WANDB_ENTITY is set to an org, we need personal account for model training
            if os.getenv("WANDB_API_KEY"):
                try:
                    import wandb
                    wandb.login(key=os.getenv("WANDB_API_KEY"))
                    api = wandb.Api()
                    # Always use viewer.username (personal account) for model training
                    entity = api.viewer.username  # Personal account (has write access)
                    default_entity = api.viewer.entity  # Might be org
                    
                    if env_entity and env_entity != entity:
                        logger.info(f"WANDB_ENTITY is '{env_entity}' (org) - using personal account '{entity}' (has write access)")
                    elif entity != default_entity:
                        logger.info(f"Default entity is '{default_entity}' (org) - using personal account '{entity}' (has write access)")
                    else:
                        logger.info(f"Using W&B entity: {entity}")
                except Exception as e:
                    logger.warning(f"Could not auto-detect entity: {e}")
                    entity = env_entity  # Fall back to env var if API fails
            else:
                entity = env_entity
        
        # Create model with explicit entity (avoids permissions issues)
        # CRITICAL: Pass project name WITHOUT entity prefix when entity is passed separately
        # ART framework expects: project="project-name", entity="entity-name" (not "entity/project")
        self.model = art.TrainableModel(
            name=name,
            project=project_name,  # Project name WITHOUT entity prefix
            entity=entity,  # CRITICAL: Pass entity separately to use personal account
            base_model=self.base_model
        )
        logger.info(f"Created model '{name}' in project '{entity}/{project_name}'")
        
        # Check if WANDB_API_KEY is set to decide backend
        # If set: use W&B remote training (preferred)
        # If not set: fall back to local training (with resource checks)
        wandb_key = os.getenv('WANDB_API_KEY')
        train_local_flag = os.getenv('TRAIN_RL_LOCAL', 'false').lower() == 'true'
        force_local = os.getenv('FORCE_LOCAL_TRAINING', 'false').lower() == 'true'
        
        if wandb_key:
            # CRITICAL: Initialize wandb with _service_wait BEFORE using ServerlessBackend
            # This fixes the 524 timeout issue by increasing service wait time
            # Must create actual run (not disabled) for settings to take effect
            self._wandb_run = None
            try:
                import wandb
                # Initialize wandb with extended timeout for service operations
                # Create actual run (not disabled) so settings apply globally
                self._wandb_run = wandb.init(
                    project=project_name,
                    entity=entity,
                    settings=wandb.Settings(_service_wait=300),  # 5 minute timeout (fixes 524)
                    name="training-init"  # Create actual run for settings to take effect
                )
                logger.info("✓ Initialized W&B with _service_wait=300 (fixes 524 timeout)")
            except Exception as e:
                logger.warning(f"Could not initialize wandb with _service_wait: {e}")
                self._wandb_run = None
            
            # WANDB_API_KEY is set - use W&B remote training (preferred)
            self.backend = ServerlessBackend(api_key=wandb_key)
            
            # CRITICAL: Add retry logic for transient W&B API errors (524 timeout, 500 workflow errors)
            max_retries = 3
            retry_delay = 10  # seconds
            
            for attempt in range(1, max_retries + 1):
                try:
                    if attempt > 1:
                        logger.info(f"Retry attempt {attempt}/{max_retries} (waiting {retry_delay}s)...")
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    
                    # Wrap in asyncio.wait_for to add our own timeout
                    await asyncio.wait_for(
                        self.model.register(self.backend),
                        timeout=180.0  # 3 minute timeout per attempt
                    )
                    logger.info("✓ Using W&B ServerlessBackend for REMOTE training")
                    logger.info(f"  Model: {self.base_model}")
                    logger.info("  Training will run on W&B infrastructure (not local GPU)")
                    break
                    
                except asyncio.TimeoutError:
                    if attempt < max_retries:
                        logger.warning(f"Model registration timeout (attempt {attempt}/{max_retries})")
                        continue
                    else:
                        raise ValueError("W&B training API timeout after all retries - service may be overloaded")
                        
                except Exception as e:
                    error_str = str(e)
                    # Retry on transient errors: 524 timeout, 500 workflow errors
                    is_retryable = (
                        "524" in error_str or 
                        "timeout" in error_str.lower() or
                        "500" in error_str or
                        "workflow error" in error_str.lower() or
                        "InternalServerError" in str(type(e))
                    )
                    
                    if is_retryable and attempt < max_retries:
                        if "500" in error_str or "workflow error" in error_str.lower():
                            logger.warning(f"W&B workflow error (attempt {attempt}/{max_retries}) - retrying...")
                        else:
                            logger.warning(f"W&B timeout (attempt {attempt}/{max_retries}) - retrying...")
                        continue
                    else:
                        # Different error or out of retries - raise
                        raise
        else:
            # WANDB_API_KEY not set - check if local training is allowed
            is_large_model = any(size in self.base_model for size in ["14B", "7B", "32B"])
            
            # Check resources before allowing local training of large models
            if is_large_model and not force_local:
                # Large model - require force flag or WANDB
                raise ValueError(
                    f"Cannot train large model ({self.base_model}) locally without FORCE_LOCAL_TRAINING=true. "
                    "Large models require significant resources (14B needs ~30GB+ RAM). "
                    "Options:\n"
                    "  1. Set WANDB_API_KEY for remote training (recommended)\n"
                    "  2. Set FORCE_LOCAL_TRAINING=true to override (use at your own risk)\n"
                    "Get WANDB key from: https://wandb.ai/settings"
                )
            
            # Check available memory for resource warning
            if is_large_model:
                try:
                    import psutil
                    available_gb = psutil.virtual_memory().available / (1024**3)
                    total_gb = psutil.virtual_memory().total / (1024**3)
                    logger.warning(f"⚠️  Training large model locally: {self.base_model}")
                    logger.warning(f"   Available memory: {available_gb:.1f}GB / {total_gb:.1f}GB")
                    if available_gb < 32:
                        logger.warning("   ⚠️  WARNING: Low available memory - training may fail or be very slow")
                    if force_local:
                        logger.warning("   FORCE_LOCAL_TRAINING enabled - proceeding despite warnings")
                except ImportError:
                    logger.warning("⚠️  psutil not available - cannot check system resources")
                    logger.warning("   Install with: pip install psutil")
                except Exception as e:
                    logger.warning(f"⚠️  Could not check memory: {e}")
            
            # Try local training fallback
            # Try ServerlessBackend without API key (may support local fallback)
            try:
                self.backend = ServerlessBackend()  # No API key = local fallback
                await self.model.register(self.backend)
                logger.info("⚠️  WANDB_API_KEY not set - using LOCAL training fallback")
                logger.info(f"  Model: {self.base_model}")
                logger.info("  Training will run on local GPU/CPU")
                logger.warning("  For remote training, set WANDB_API_KEY environment variable")
            except Exception as e:
                # If ServerlessBackend doesn't support local fallback, try LocalBackend
                try:
                    from art.local.backend import LocalBackend
                    self.backend = LocalBackend()
                    await self.model.register(self.backend)
                    logger.info("✓ Using LocalBackend for LOCAL training")
                    logger.info(f"  Model: {self.base_model}")
                    logger.info("  Training will run on local GPU/CPU")
                except ImportError:
                    # LocalBackend not available, raise helpful error
                    raise ValueError(
                        f"WANDB_API_KEY not set and local training not available. "
                        f"Set WANDB_API_KEY for remote training or ensure local backend is available. "
                        f"Error: {str(e)}"
                    )
        
        logger.info(f"✓ Model registered: {self.model.inference_model_name}")
    
    async def collect_window_data(self, window_id: str, max_examples: Optional[int] = None) -> Dict[str, Any]:
        """Collect trajectories for a window from database
        
        Args:
            window_id: Window ID to collect data for
            max_examples: Maximum number of trajectories to collect (None = no limit)
        """
        
        if not self.pool:
            await self.connect()
        
        logger.info(f"Querying database for window: {window_id} (max: {max_examples or 'unlimited'})")
        
        async with self.pool.acquire() as conn:
            # CRITICAL: Enforce max_examples limit to prevent loading 200GB of data
            # Default to 2000 if MAX_EXAMPLES env var is set but max_examples param is None
            if max_examples is None:
                max_examples_str = os.getenv("MAX_EXAMPLES")
                if max_examples_str and max_examples_str.strip():
                    try:
                        max_examples = int(max_examples_str.strip())
                        logger.info(f"Using MAX_EXAMPLES from environment: {max_examples}")
                    except ValueError:
                        logger.warning(f"Invalid MAX_EXAMPLES value: {max_examples_str}, using default 2000")
                        max_examples = 2000
                else:
                    max_examples = 2000  # Hard default limit
            
            # Query using BOTH scenarioId and windowId for compatibility
            # CRITICAL: Always use LIMIT to prevent loading unlimited data
            limit_clause = f"LIMIT {max_examples}"
            
            logger.info(f"Querying with LIMIT {max_examples} to prevent excessive memory usage")
            
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
                {limit_clause}
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
        """
        Score agents using local heuristics
        No external API calls
        
        Scoring: 50% P&L, 30% win rate, 20% activity
        """
        logger.info(f"Scoring {len(agents)} agents with local heuristics")
        
        scores = []
        
        for agent in agents:
            # Calculate metrics
            total_pnl = sum(t['pnl'] for t in agent['trajs'])
            total_actions = sum(len(t['steps']) for t in agent['trajs'])
            wins = sum(1 for t in agent['trajs'] if t['pnl'] > 0)
            losses = sum(1 for t in agent['trajs'] if t['pnl'] < 0)
            total_trades = wins + losses
            
            # Calculate score components
            # P&L: normalize -1000 to +1000 → 0 to 1
            pnl_score = max(0.0, min(1.0, (total_pnl + 1000) / 2000))
            
            # Win rate: 0 to 1
            win_rate = wins / total_trades if total_trades > 0 else 0.5
            
            # Activity: normalize to 20 actions = 1.0
            activity_score = min(1.0, total_actions / 20)
            
            # Combined score
            final_score = (
                0.5 * pnl_score +
                0.3 * win_rate +
                0.2 * activity_score
            )
            
            scores.append({
                'id': agent['id'],
                'name': agent['name'],
                'score': final_score,
                'pnl': total_pnl,
                'win_rate': win_rate,
                'actions': total_actions
            })
        
        # Sort by score
        scores.sort(key=lambda s: s['score'], reverse=True)
        
        logger.info(f"Scored: best={scores[0]['score']:.2f}, worst={scores[-1]['score']:.2f}")
        
        return scores
    
    def create_art_trajectories(
        self,
        window_data: Dict,
        scores: List[Dict]
    ) -> List:
        """Create ART Trajectory objects from your data"""
        
        import art
        
        # FIX BUG #19, #20, #23: Limit steps per trajectory for 32K context
        MAX_STEPS_PER_TRAJECTORY = 20  # Keep last 20 steps (most recent/relevant)
        
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
                
                # Truncate to last N steps to fit in 32K context window
                original_length = len(steps)
                if len(steps) > MAX_STEPS_PER_TRAJECTORY:
                    steps = steps[-MAX_STEPS_PER_TRAJECTORY:]  # Keep most recent
                    logger.info(f"Truncated trajectory from {original_length} to {MAX_STEPS_PER_TRAJECTORY} steps")
                
                # Build messages_and_choices (ART format)
                msgs = [
                    {
                        "role": "system",
                        "content": "You are a trading agent in Babylon prediction markets. Make profitable decisions."
                    }
                ]
                
                for i, step in enumerate(steps):
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
                
                # FIX BUG #21: Validate context size before creating trajectory
                # Estimate tokens (4 chars per token approximation)
                est_tokens = sum(len(m.get('content', '')) for m in msgs) // 4
                
                if est_tokens > 5000:  # Per-trajectory safety limit
                    logger.warn(f"Trajectory estimated at {est_tokens} tokens, may be too long")
                
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
                        'estimated_tokens': est_tokens
                    }
                )
                
                trajectories.append(art_traj)
        
        logger.info(f"Created {len(trajectories)} ART trajectories")
        
        return trajectories
    
    async def train_window(
        self, 
        window_id: str, 
        batch_id: Optional[str] = None,
        model_version: Optional[str] = None
    ) -> Dict:
        """
        Train on one window - complete pipeline
        
        Args:
            window_id: Window ID (YYYY-MM-DDTHH:00 format)
            batch_id: Training batch ID from TypeScript (optional)
            model_version: Model version string (optional)
        
        Returns model info for inference
        """
        logger.info("=" * 70)
        logger.info(f"🚀 TRAINING WINDOW: {window_id}")
        if batch_id:
            logger.info(f"Batch ID: {batch_id}")
        if model_version:
            logger.info(f"Model Version: {model_version}")
        logger.info("=" * 70)
        
        # Update batch status to 'training' if batch_id provided
        if batch_id and self.pool:
            try:
                await self.pool.execute(
                    "UPDATE training_batches SET status = $1, \"startedAt\" = NOW() WHERE \"batchId\" = $2",
                    'training', batch_id
                )
                logger.info(f"✓ Updated batch {batch_id} status to 'training'")
            except Exception as e:
                logger.warning(f"Failed to update batch status: {e}")
        
        # Initialize model if needed
        if not self.model:
            model_name = f"babylon-{window_id.replace(':', '-')}"
            await self.initialize_model(model_name)
        
        # Get max examples from environment
        max_examples_str = os.getenv("MAX_EXAMPLES")
        max_examples = int(max_examples_str) if max_examples_str and max_examples_str.strip() else None
        
        # Step 1: Collect
        logger.info("\n[1/4] Collecting from database...")
        if max_examples:
            logger.info(f"Capping training data at {max_examples} examples")
        data = await self.collect_window_data(window_id, max_examples=max_examples)
        
        # Allow training with 0 agents if forcing (for wandb testing)
        # Check environment variable FORCE_TRAINING to bypass agent count check
        force_training = os.getenv("FORCE_TRAINING", "false").lower() == "true"
        
        if data['count'] < self.min_agents:
            if force_training and data['count'] == 0:
                logger.warning(
                    f"FORCE_TRAINING enabled: No trajectories found, but wandb integration will be verified"
                )
                logger.info("Model initialization will verify wandb connection, but training will be skipped")
                # Return early with wandb verification - model is already initialized above
                step = await self.model.get_step()
                inference_name = f"{self.model.get_inference_name()}:step{step}"
                
                logger.info("\n" + "=" * 70)
                logger.info("✅ WANDB VERIFICATION SUCCESS")
                logger.info("=" * 70)
                logger.info(f"Model initialized: {inference_name}")
                logger.info("W&B ServerlessBackend is working correctly")
                logger.info("=" * 70)
                logger.warning("⚠️  No trajectories to train - add trajectories to window for actual training")
                
                # Update batch status
                if batch_id and self.pool:
                    try:
                        await self.pool.execute(
                            "UPDATE training_batches SET status = $1, error = $2 WHERE \"batchId\" = $3",
                            'failed', 'Wandb verified but no trajectories to train', batch_id
                        )
                    except Exception:
                        pass
                
                return {
                    'window_id': window_id,
                    'model_name': inference_name,
                    'model_id': None,
                    'step': step,
                    'num_agents': 0,
                    'num_trajectories': 0,
                    'batch_id': batch_id,
                    'wandb_verified': True
                }
            else:
                error_msg = (
                    f"Window {window_id}: Only {data['count']} agents, need {self.min_agents}\n"
                    f"Try lowering MIN_AGENTS_PER_WINDOW or wait for more data\n"
                    f"Or set FORCE_TRAINING=true to test wandb integration with minimal data"
                )
                # Update batch status to failed
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
        
        # Step 3: Create ART trajectories
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
        
        # Step 4: Train
        logger.info("\n[4/4] Training with ART...")
        
        import art
        
        # FIX BUG #22, #24: Split into smaller groups for 32K context limit
        # Don't send all trajectories in one group - split for safety
        MAX_TRAJECTORIES_PER_GROUP = 10  # Safe for 32K context
        
        groups = []
        for i in range(0, len(art_trajs), MAX_TRAJECTORIES_PER_GROUP):
            batch = art_trajs[i:i + MAX_TRAJECTORIES_PER_GROUP]
            groups.append(art.TrajectoryGroup(
                trajectories=batch,
                metadata={
                    'window_id': window_id,
                    'batch_index': i // MAX_TRAJECTORIES_PER_GROUP,
                    'batch_size': len(batch)
                }
            ))
        
        logger.info(f"Split {len(art_trajs)} trajectories into {len(groups)} groups of max {MAX_TRAJECTORIES_PER_GROUP}")
        
        try:
            await self.model.train(
                groups=groups,  # Multiple smaller groups instead of one huge group
                config=art.TrainConfig(
                    learning_rate=1e-5,
                    # Note: ART handles context automatically, but we've pre-limited for safety
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
        
        # Get inference info - this is the WANDB model identifier
        step = await self.model.get_step()
        inference_name = f"{self.model.get_inference_name()}:step{step}"
        
        # Extract WANDB model ID (entity/project/model-name format)
        # The inference_name from ART is already in the correct format for WANDB API
        wandb_model_id = inference_name  # This is the format WANDB expects
        
        logger.info("\n" + "=" * 70)
        logger.info("✅ SUCCESS")
        logger.info("=" * 70)
        logger.info(f"Model: {wandb_model_id}")
        logger.info(f"Step: {step}")
        logger.info(f"Agents trained: {data['count']}")
        logger.info(f"Trajectories: {len(art_trajs)}")
        logger.info("=" * 70)
        
        # Save model to database
        if batch_id and model_version and self.pool:
            try:
                # Calculate average reward from scores
                avg_reward = sum(s['score'] for s in scores) / len(scores) if scores else 0.0
                
                # Create model record
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
                    wandb_model_id,  # Store WANDB model ID as storagePath
                    'ready',
                    avg_reward
                )
                
                # Update batch status to completed
                await self.pool.execute(
                    "UPDATE training_batches SET status = $1, \"completedAt\" = NOW() WHERE \"batchId\" = $2",
                    'completed', batch_id
                )
                
                logger.info(f"✓ Saved model to database: {model_id} (WANDB: {wandb_model_id})")
            except Exception as e:
                logger.error(f"Failed to save model to database: {e}")
                # Don't fail the whole training if DB save fails
        
        # Ensure model_id is set even if batch_id/model_version weren't provided
        result_model_id = None
        if batch_id and model_version:
            result_model_id = model_id
        elif batch_id:
            # Fallback: use batch_id as model identifier
            result_model_id = f"babylon-agent-batch-{batch_id}"
        
        return {
            'window_id': window_id,
            'model_name': wandb_model_id,  # Return WANDB model ID
            'model_id': result_model_id,
            'step': step,
            'num_agents': data['count'],
            'num_trajectories': len(art_trajs),
            'batch_id': batch_id
        }
    
    async def test_inference(self) -> str:
        """Test inference endpoint"""
        
        if not self.model:
            raise ValueError("Model not initialized. Train first.")
        
        logger.info("\n🧪 Testing inference...")
        
        # Get model name
        step = await self.model.get_step()
        model_name = f"{self.model.get_inference_name()}:step{step}"
        
        # Use OpenAI client
        client = self.model.openai_client()
        
        messages = [
            {"role": "system", "content": "You are a trading agent."},
            {"role": "user", "content": "Balance: $10000, P&L: $0. Should I buy BTC or wait?"}
        ]
        
        completion = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=50
        )
        
        response = completion.choices[0].message.content
        
        logger.info(f"✓ Inference works!")
        logger.info(f"Response: {response}")
        
        return response


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
    
    # Check training configuration
    wandb_key = os.getenv("WANDB_API_KEY")
    train_local_flag = os.getenv("TRAIN_RL_LOCAL", "false").lower() == "true"
    force_local = os.getenv("FORCE_LOCAL_TRAINING", "false").lower() == "true"
    base_model = os.getenv("BASE_MODEL", "OpenPipe/Qwen3-14B-Instruct")
    is_large_model = any(size in base_model for size in ["14B", "7B", "32B"])
    
    if wandb_key:
        # WANDB available - prefer remote training
        print("✅ WANDB_API_KEY found - using W&B serverless REMOTE training")
        print("   Training will run on W&B infrastructure (not local GPU)")
        print(f"   Model: {base_model}")
    else:
        # WANDB_API_KEY not set - check if local training is allowed
        print("⚠️  WANDB_API_KEY not set - checking local training options")
        print(f"   Model: {base_model}")
        
        if is_large_model and not force_local:
            print("❌ ERROR: Cannot train large model locally without FORCE_LOCAL_TRAINING=true")
            print("   Large models require significant resources (14B needs ~30GB+ RAM)")
            print("\n   Options:")
            print("   1. Set WANDB_API_KEY for remote training (recommended)")
            print("   2. Set FORCE_LOCAL_TRAINING=true to override (use at your own risk)")
            print("\n   Get WANDB key from: https://wandb.ai/settings")
            return
        
        if is_large_model and force_local:
            print("⚠️  FORCE_LOCAL_TRAINING enabled for large model")
            print("   ⚠️  Ensure you have sufficient resources (~30GB+ RAM)")
        
        # Check available memory
        try:
            import psutil
            available_gb = psutil.virtual_memory().available / (1024**3)
            total_gb = psutil.virtual_memory().total / (1024**3)
            print(f"   Available memory: {available_gb:.1f}GB / {total_gb:.1f}GB")
            if is_large_model and available_gb < 32:
                print("   ⚠️  WARNING: Low available memory - training may fail or be very slow")
        except ImportError:
            print("   ⚠️  psutil not available - cannot check system resources")
            print("   Install with: pip install psutil")
        except Exception as e:
            print(f"   ⚠️  Could not check memory: {e}")
        
        print("\n   Proceeding with LOCAL training fallback...")
        print("   For remote training, set WANDB_API_KEY:")
        print("   export WANDB_API_KEY=your-key-here")
        print("   Get your key from: https://wandb.ai/settings")
    
    print("\n" + "=" * 70)
    print("🚀 BABYLON RL TRAINING")
    print("=" * 70)
    print()
    
    # CRITICAL: Auto-detect entity to avoid permissions issues
    # Use personal account (has write access) instead of org if no entity specified
    project_name = os.getenv("WANDB_PROJECT", "babylon")
    entity = os.getenv("WANDB_ENTITY")
    
    # If project doesn't include entity and WANDB_ENTITY not set, auto-detect from API
    if "/" not in project_name and not entity and wandb_key:
        try:
            import wandb
            # Get entity from API first (before init to avoid permission issues)
            wandb.login(key=wandb_key)
            api = wandb.Api()
            entity = api.viewer.username  # Use personal account (has write access)
            print(f"✅ Auto-detected W&B entity: {entity} (personal account)")
            print(f"   Project will be: {entity}/{project_name}")
            
            # CRITICAL: Initialize wandb with _service_wait to fix 524 timeout
            # Use actual run (not disabled) so settings apply globally
            wandb_run = wandb.init(
                project=project_name,
                entity=entity,  # Use personal account
                settings=wandb.Settings(_service_wait=300),  # 5 minute timeout
                name="training-init"  # Create actual run for settings
            )
            print(f"   Initialized W&B with _service_wait=300 (fixes 524 timeout)")
            # Don't finish yet - keep it open for training
        except Exception as e:
            print(f"⚠️  Could not auto-detect entity: {e}")
            print(f"   Using project as-is: {project_name}")
            entity = None
    
    # Create trainer (will handle entity/project formatting)
    trainer = BabylonTrainer(
        db_url=db_url,
        project=project_name if not entity else f"{entity}/{project_name}",
        base_model=os.getenv("BASE_MODEL", "OpenPipe/Qwen3-14B-Instruct"),  # ONLY model available in W&B ART
        min_agents=int(os.getenv("MIN_AGENTS_PER_WINDOW", "1"))
    )
    
    await trainer.connect()
    
    try:
        mode = os.getenv("MODE", "single")
        
        if mode == "list":
            # List available windows
            print("Checking for ready windows...")
            
            ready = []
            for hours_ago in range(2, 72):  # Check last 3 days
                window_id = trainer.get_window_id(hours_ago)
                data = await trainer.collect_window_data(window_id)
                
                if data['count'] >= trainer.min_agents:
                    ready.append((window_id, data['count']))
            
            print(f"\nReady windows ({len(ready)}):")
            for window_id, count in ready[:10]:
                print(f"  {window_id}: {count} agents")
            
            if not ready:
                print("\n⚠️  No windows with enough agents found")
                print(f"Need {trainer.min_agents}+ agents per window")
                print("Check: SELECT \"scenarioId\", COUNT(*) FROM trajectories GROUP BY \"scenarioId\";")
        
        elif mode == "single":
            # Train on one window
            window_id = os.getenv("WINDOW_ID")
            batch_id = os.getenv("BATCH_ID")  # From TypeScript
            model_version = os.getenv("MODEL_VERSION")  # From TypeScript
            
            if not window_id:
                # Find a ready window
                for hours_ago in range(2, 72):
                    wid = trainer.get_window_id(hours_ago)
                    data = await trainer.collect_window_data(wid)
                    if data['count'] >= trainer.min_agents:
                        window_id = wid
                        break
            
            if not window_id:
                print(f"❌ No windows with {trainer.min_agents}+ agents found")
                print("Try: MODE=list to see what's available")
                return
            
            print(f"Training on: {window_id}\n")
            if batch_id:
                print(f"Batch ID: {batch_id}")
            if model_version:
                print(f"Model Version: {model_version}\n")
            
            # Train!
            result = await trainer.train_window(window_id, batch_id=batch_id, model_version=model_version)
            
            # Test inference
            print()
            response = await trainer.test_inference()
            
            print(f"\n✅ All done!")
            print(f"Model: {result['model_name']}")
            if result.get('model_id'):
                print(f"Model ID: {result['model_id']}")
            print(f"Ready for use!")
        
        else:
            print(f"Unknown mode: {mode}")
            print("Use: MODE=list or MODE=single")
    
    finally:
        await trainer.close()


if __name__ == "__main__":
    asyncio.run(main())
