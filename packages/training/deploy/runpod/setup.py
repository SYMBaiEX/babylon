#!/usr/bin/env python3
"""
Babylon Training & Benchmark - RunPod Deployment

Simple script to spin up training and benchmark pods on RunPod.

Usage:
    # Training (using env file)
    python setup.py train --gpu h100 --image user/babylon-training:latest --env-file ../.env
    
    # Benchmark with HuggingFace model
    python setup.py benchmark --gpu h100 --hf-model elizaos/ishtar-v0.1
    
    # Benchmark with local model (must be accessible via volume or pre-baked in image)
    python setup.py benchmark --gpu h100 --model /models/final_model
    
    # List pods
    python setup.py list
    
    # Stop/delete pod
    python setup.py stop <pod-id>

Requires: RUNPOD_API_KEY environment variable or in env file
"""

import argparse
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

API = "https://rest.runpod.io/v1"

# GPU short names -> RunPod IDs
GPUS = {
    "4090": "NVIDIA GeForce RTX 4090",
    "a100": "NVIDIA A100 80GB PCIe", 
    "l40s": "NVIDIA L40S",
    "h100": "NVIDIA H100 80GB HBM3",
    "h200": "NVIDIA H200",
}

# Which training profile to use per GPU
PROFILES = {
    "4090": "24gb",
    "a100": "a100",
    "l40s": "l40",
    "h100": "h100",
    "h200": "h100",
}


def load_env_file(path: str) -> dict:
    """Load environment variables from a file."""
    env = {}
    path = Path(path)
    if not path.exists():
        sys.exit(f"Env file not found: {path}")
    
    with open(path) as f:
        for line in f:
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith("#"):
                continue
            # Parse KEY=VALUE
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                # Remove quotes if present
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                if value:  # Only set non-empty values
                    env[key] = value
    return env


def load_api_key():
    """Load RUNPOD_API_KEY from environment or default .env file."""
    key = os.environ.get("RUNPOD_API_KEY")
    if key:
        return key
    
    # Try loading from default .env locations
    script_dir = Path(__file__).parent
    env_locations = [
        script_dir / ".env",
        script_dir.parent / ".env",
        script_dir.parent / "deploy" / ".env",
    ]
    
    for env_path in env_locations:
        if env_path.exists():
            env = load_env_file(str(env_path))
            if "RUNPOD_API_KEY" in env:
                return env["RUNPOD_API_KEY"]
    
    return None


def api(method, endpoint, data=None):
    """Make API request."""
    key = load_api_key()
    if not key:
        sys.exit("Set RUNPOD_API_KEY (https://console.runpod.io/user/settings) or use --env-file")
    
    r = requests.request(
        method, f"{API}{endpoint}",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=data
    )
    if r.status_code >= 400:
        sys.exit(f"API error {r.status_code}: {r.text}")
    return r.json() if r.text else None


def cmd_train(args):
    """Create a training pod."""
    gpu_id = GPUS.get(args.gpu)
    if not gpu_id:
        sys.exit(f"Unknown GPU. Available: {', '.join(GPUS.keys())}")
    
    # Load env file if provided
    env = {}
    if args.env_file:
        env = load_env_file(args.env_file)
        print(f"Loaded {len(env)} environment variables from {args.env_file}")
        
        # Set RUNPOD_API_KEY from env file if not already set
        if "RUNPOD_API_KEY" in env and not os.environ.get("RUNPOD_API_KEY"):
            os.environ["RUNPOD_API_KEY"] = env["RUNPOD_API_KEY"]
    
    # CLI args override env file
    if args.db:
        env["DATABASE_URL"] = args.db
    if args.wandb:
        env["WANDB_API_KEY"] = args.wandb
        env["WANDB_MODE"] = "online"
    if args.hf_token:
        env["HF_TOKEN"] = args.hf_token
    # Ensure HF_TOKEN is included for private datasets (from env file if not CLI arg)
    if "HF_TOKEN" not in env and not args.hf_token:
        hf_token = os.environ.get("HF_TOKEN")
        if hf_token:
            env["HF_TOKEN"] = hf_token
    
    # Determine profile
    profile = args.profile or env.get("TRAINING_PROFILE") or PROFILES.get(args.gpu, "24gb")
    steps = args.steps or int(env.get("TRAINING_STEPS", 1000))
    min_agents = args.min_agents_per_window or int(env.get("MIN_AGENTS_PER_WINDOW", 1))
    
    # Ensure data source - CLI --hf-dataset, env HF_TRAJECTORY_DATASET, or DATABASE_URL
    hf_dataset = getattr(args, 'hf_dataset', None) or env.get("HF_TRAJECTORY_DATASET")
    trajectory_source = env.get("TRAJECTORY_SOURCE", "db").lower()
    
    if trajectory_source == "huggingface" and not hf_dataset:
        sys.exit("TRAJECTORY_SOURCE=huggingface but no HF dataset. Use --hf-dataset or set HF_TRAJECTORY_DATASET in env file.")
    elif trajectory_source != "huggingface" and not hf_dataset and "DATABASE_URL" not in env:
        sys.exit("Data source required. Use --hf-dataset, set HF_TRAJECTORY_DATASET, or set DATABASE_URL in env file.")
    
    # Build docker command
    docker_cmd = [
        "python3", "python/scripts/run_training.py",
        "--profile", profile,
        "--steps", str(steps),
        "--min-agents-per-window", str(min_agents)
    ]
    
    # Add HuggingFace dataset if specified
    if hf_dataset:
        docker_cmd.extend(["--hf-dataset", hf_dataset])
    
    pod = api("POST", "/pods", {
        "name": args.name or f"babylon-{args.gpu}",
        "imageName": args.image,
        "gpuTypeIds": [gpu_id],
        "gpuCount": args.gpus,
        "volumeInGb": 100,
        "containerDiskInGb": 100,
        "env": env,
        "dockerStartCmd": docker_cmd,
        "ports": ["8888/http", "22/tcp"],
        "cloudType": "COMMUNITY" if args.community else "SECURE",
        "interruptible": args.spot,
        "supportPublicIp": True,
    })
    
    print(f"\n✓ Created pod: {pod['id']}")
    print(f"  Name: {args.name or f'babylon-{args.gpu}'}")
    print(f"  GPU: {gpu_id}")
    print(f"  Profile: {profile}")
    print(f"  Steps: {steps}")
    print(f"  Min agents/window: {min_agents}")
    print(f"  Spot: {args.spot}")
    print("\n  View at: https://console.runpod.io/pods")


def cmd_list(args):
    """List running pods."""
    # Load env file if provided
    if hasattr(args, 'env_file') and args.env_file:
        env = load_env_file(args.env_file)
        if "RUNPOD_API_KEY" in env and not os.environ.get("RUNPOD_API_KEY"):
            os.environ["RUNPOD_API_KEY"] = env["RUNPOD_API_KEY"]
    
    pods = api("GET", "/pods?includeMachine=true")
    if not pods:
        print("No pods.")
        return
    
    print(f"\n{'ID':<16} {'Name':<20} {'Status':<10} {'GPU':<25} {'$/hr':<8}")
    print("-" * 80)
    for p in pods:
        gpu = p.get("machine", {}).get("gpuDisplayName", "?")[:24] if p.get("machine") else "?"
        cost = f"${p.get('costPerHr', 0):.2f}" if p.get("costPerHr") else "?"
        print(f"{p['id']:<16} {(p.get('name') or '?')[:19]:<20} {p['desiredStatus']:<10} {gpu:<25} {cost:<8}")
    print()


def cmd_stop(args):
    """Stop and delete a pod."""
    api("DELETE", f"/pods/{args.pod_id}")
    print(f"✓ Deleted pod {args.pod_id}")


def cmd_logs(args):
    """Get pod logs (requires SSH or web console)."""
    print(f"View logs at: https://console.runpod.io/pods?id={args.pod_id}")


def cmd_benchmark(args):
    """Create a benchmark pod."""
    gpu_id = GPUS.get(args.gpu)
    if not gpu_id:
        sys.exit(f"Unknown GPU. Available: {', '.join(GPUS.keys())}")
    
    # Load env file if provided
    env = {}
    if args.env_file:
        env = load_env_file(args.env_file)
        print(f"Loaded {len(env)} environment variables from {args.env_file}")
        
        # Set RUNPOD_API_KEY from env file if not already set
        if "RUNPOD_API_KEY" in env and not os.environ.get("RUNPOD_API_KEY"):
            os.environ["RUNPOD_API_KEY"] = env["RUNPOD_API_KEY"]
    
    # Benchmark-specific env vars
    if args.hf_model:
        env["HF_MODEL"] = args.hf_model
    if args.model:
        env["MODEL_PATH"] = args.model
    
    # Propagate HF_TOKEN from CLI arg, env file, or host environment
    hf_token = args.hf_token or env.get("HF_TOKEN") or os.environ.get("HF_TOKEN")
    if hf_token:
        env["HF_TOKEN"] = hf_token
    
    if args.quick:
        env["BENCHMARK_QUICK"] = "true"
    if args.scenario:
        env["BENCHMARK_SCENARIO"] = args.scenario
    
    # Validate model source
    if not args.hf_model and not args.model:
        sys.exit("Either --hf-model or --model is required for benchmarking.")
    
    # Determine image
    image = args.image or f"{os.environ.get('DOCKER_REGISTRY', 'revlentless')}/babylon-benchmark:latest"
    
    # Build docker command (entrypoint handles the rest via env vars)
    docker_cmd = []  # Use image's default entrypoint
    
    pod = api("POST", "/pods", {
        "name": args.name or f"babylon-bench-{args.gpu}",
        "imageName": image,
        "gpuTypeIds": [gpu_id],
        "gpuCount": 1,  # Benchmark typically needs 1 GPU
        "volumeInGb": 50,
        "containerDiskInGb": 50,
        "env": env,
        "dockerStartCmd": docker_cmd if docker_cmd else None,
        "ports": ["9001/http"],  # vLLM port
        "cloudType": "COMMUNITY" if args.community else "SECURE",
        "interruptible": args.spot,
        "supportPublicIp": True,
    })
    
    print(f"\n✓ Created benchmark pod: {pod['id']}")
    print(f"  Name: {args.name or f'babylon-bench-{args.gpu}'}")
    print(f"  GPU: {gpu_id}")
    if args.hf_model:
        print(f"  HF Model: {args.hf_model}")
    if args.model:
        print(f"  Model Path: {args.model}")
    print(f"  Quick mode: {args.quick}")
    if args.scenario:
        print(f"  Scenario: {args.scenario}")
    print(f"  Spot: {args.spot}")
    print("\n  View at: https://console.runpod.io/pods")


def main():
    p = argparse.ArgumentParser(
        description="Babylon RunPod Training & Benchmarking",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Training Examples:
  # Using HuggingFace dataset (recommended for RunPod)
  python setup.py train --gpu h100 --image user/babylon-training:latest --env-file ../.env --hf-dataset elizaos/enkidu-trajectories-raw
  
  # Using database URL (requires network access to DB)
  python setup.py train --gpu h100 --image user/babylon-training:latest --db "postgresql://..."
  
  # Spot instance (cheaper)
  python setup.py train --gpu 4090 --image user/babylon-training:latest --env-file .env --hf-dataset org/dataset --spot

Benchmark Examples:
  # Benchmark HuggingFace model
  python setup.py benchmark --gpu h100 --hf-model elizaos/ishtar-v0.1 --quick
  
  # Specific scenario
  python setup.py benchmark --gpu 4090 --hf-model elizaos/ishtar-v0.1 --scenario bear-market
  
  # Spot instance for cost savings
  python setup.py benchmark --gpu 4090 --hf-model elizaos/ishtar-v0.1 --spot --community
"""
    )
    sub = p.add_subparsers(dest="cmd")
    
    # train
    t = sub.add_parser("train", help="Start a training pod")
    t.add_argument("--gpu", required=True, choices=GPUS.keys(), help="GPU type")
    t.add_argument("--image", required=True, help="Docker image")
    t.add_argument("--env-file", help="Path to .env file (recommended)")
    t.add_argument("--name", help="Pod name (default: babylon-<gpu>)")
    t.add_argument("--gpus", type=int, default=1, help="GPU count")
    t.add_argument("--steps", type=int, help="Training steps (default: from env or 1000)")
    t.add_argument("--profile", help="Training profile (default: auto from GPU)")
    t.add_argument("--db", help="DATABASE_URL (overrides env file)")
    t.add_argument("--wandb", help="WANDB_API_KEY (overrides env file)")
    t.add_argument("--hf-token", help="HF_TOKEN (overrides env file)")
    t.add_argument("--hf-dataset", help="HuggingFace dataset ID for training data (instead of DATABASE_URL)")
    t.add_argument("--min-agents-per-window", type=int, help="Min trajectories per window (default: 1)")
    t.add_argument("--spot", action="store_true", help="Use spot instance (cheaper, may interrupt)")
    t.add_argument("--community", action="store_true", help="Use community cloud (cheaper)")
    
    # list
    lst = sub.add_parser("list", help="List pods")
    lst.add_argument("--env-file", help="Path to .env file (for RUNPOD_API_KEY)")
    
    # stop
    s = sub.add_parser("stop", help="Delete a pod")
    s.add_argument("pod_id", help="Pod ID")
    
    # logs
    lg = sub.add_parser("logs", help="View pod logs")
    lg.add_argument("pod_id", help="Pod ID")
    
    # benchmark
    b = sub.add_parser("benchmark", help="Start a benchmark pod")
    b.add_argument("--gpu", required=True, choices=GPUS.keys(), help="GPU type")
    b.add_argument("--image", help="Docker image (default: revlentless/babylon-benchmark:latest)")
    b.add_argument("--hf-model", help="HuggingFace model ID to benchmark")
    b.add_argument("--model", help="Path to model inside container")
    b.add_argument("--env-file", help="Path to .env file")
    b.add_argument("--name", help="Pod name (default: babylon-bench-<gpu>)")
    b.add_argument("--hf-token", help="HF_TOKEN for private models")
    b.add_argument("--quick", action="store_true", help="Quick mode (7-day scenarios)")
    b.add_argument("--scenario", help="Specific scenario to run")
    b.add_argument("--spot", action="store_true", help="Use spot instance")
    b.add_argument("--community", action="store_true", help="Use community cloud")
    
    args = p.parse_args()
    
    if args.cmd == "train":
        cmd_train(args)
    elif args.cmd == "benchmark":
        cmd_benchmark(args)
    elif args.cmd == "list":
        cmd_list(args)
    elif args.cmd == "stop":
        cmd_stop(args)
    elif args.cmd == "logs":
        cmd_logs(args)
    else:
        p.print_help()


if __name__ == "__main__":
    main()
