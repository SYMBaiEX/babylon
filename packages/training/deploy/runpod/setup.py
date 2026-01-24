#!/usr/bin/env python3
"""
Babylon Training - RunPod Deployment

Simple script to spin up training pods on RunPod.

Usage:
    # Using env file (recommended)
    python setup.py train --gpu h100 --image user/babylon:latest --env-file ../env.example
    
    # Using CLI args
    python setup.py train --gpu h100 --image user/babylon:latest --db "postgresql://..."
    
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


def api(method, endpoint, data=None):
    """Make API request."""
    key = os.environ.get("RUNPOD_API_KEY")
    if not key:
        sys.exit("Set RUNPOD_API_KEY (https://console.runpod.io/user/settings)")
    
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
    
    # Determine profile
    profile = args.profile or env.get("TRAINING_PROFILE") or PROFILES.get(args.gpu, "24gb")
    steps = args.steps or int(env.get("TRAINING_STEPS", 1000))
    min_agents = args.min_agents_per_window or int(env.get("MIN_AGENTS_PER_WINDOW", 1))
    
    # Ensure required vars
    if "DATABASE_URL" not in env:
        sys.exit("DATABASE_URL required. Use --db or set in env file.")
    
    # Build docker command
    docker_cmd = [
        "python3", "python/scripts/run_training.py",
        "--profile", profile,
        "--steps", str(steps),
        "--min-agents-per-window", str(min_agents)
    ]
    
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
    print(f"\n  View at: https://console.runpod.io/pods")


def cmd_list(args):
    """List running pods."""
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

def main():
    p = argparse.ArgumentParser(
        description="Babylon RunPod Training",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Using env file
  python setup.py train --gpu h100 --image user/babylon:latest --env-file ../env.example
  
  # Using CLI args  
  python setup.py train --gpu h100 --image user/babylon:latest --db "postgresql://..."
  
  # Spot instance (cheaper)
  python setup.py train --gpu 4090 --image user/babylon:latest --env-file .env --spot
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
    t.add_argument("--min-agents-per-window", type=int, help="Min trajectories per window (default: 1)")
    t.add_argument("--spot", action="store_true", help="Use spot instance (cheaper, may interrupt)")
    t.add_argument("--community", action="store_true", help="Use community cloud (cheaper)")
    
    # list
    sub.add_parser("list", help="List pods")
    
    # stop
    s = sub.add_parser("stop", help="Delete a pod")
    s.add_argument("pod_id", help="Pod ID")
    
    # logs
    lg = sub.add_parser("logs", help="View pod logs")
    lg.add_argument("pod_id", help="Pod ID")
    
    args = p.parse_args()
    
    if args.cmd == "train":
        cmd_train(args)
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
