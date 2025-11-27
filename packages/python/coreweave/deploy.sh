#!/bin/bash
# Deploy Babylon RL Training to CoreWeave

set -e

echo "🚀 Deploying Babylon RL Training to CoreWeave"
echo "=============================================="
echo ""

# Configuration
NAMESPACE="babylon"
DOCKER_IMAGE="babylonrl/training-pipeline:latest"
REGISTRY="registry.coreweave.cloud"

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ docker is required"; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "❌ kubectl is required"; exit 1; }

# Check if connected to CoreWeave
if ! kubectl cluster-info | grep -q "coreweave"; then
    echo "❌ Not connected to CoreWeave cluster"
    echo "Run: kubectl config use-context coreweave"
    exit 1
fi

echo "✅ Prerequisites checked"
echo ""

# Step 1: Build Docker image
echo "📦 Building Docker image..."
cd "$(dirname "$0")/.."
docker build -f coreweave/Dockerfile -t "$DOCKER_IMAGE" .
echo "✅ Image built"
echo ""

# Step 2: Push to CoreWeave registry
echo "📤 Pushing to CoreWeave registry..."
docker tag "$DOCKER_IMAGE" "$REGISTRY/$DOCKER_IMAGE"
docker push "$REGISTRY/$DOCKER_IMAGE"
echo "✅ Image pushed"
echo ""

# Step 3: Create namespace if not exists
echo "📁 Setting up namespace..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
echo "✅ Namespace ready"
echo ""

# Step 4: Create secrets
echo "🔐 Setting up secrets..."

if [ -f ".env.coreweave" ]; then
    echo "Found .env.coreweave, creating secrets..."
    
    kubectl create secret generic babylon-secrets \
        --from-env-file=.env.coreweave \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    echo "✅ Secrets created"
else
    echo "⚠️  No .env.coreweave file found"
    echo "Please create secrets manually:"
    echo "  kubectl create secret generic babylon-secrets \\"
    echo "    --from-literal=DATABASE_URL=... \\"
    echo "    --from-literal=OPENPIPE_API_KEY=... \\"
    echo "    --namespace=$NAMESPACE"
fi
echo ""

# Step 5: Deploy infrastructure
echo "🏗️  Deploying infrastructure..."
kubectl apply -f coreweave/deployment.yaml
echo "✅ Infrastructure deployed"
echo ""

# Step 6: Wait for rollout
echo "⏳ Waiting for deployment..."
kubectl rollout status deployment/babylon-training -n "$NAMESPACE" --timeout=10m
kubectl rollout status deployment/babylon-inference -n "$NAMESPACE" --timeout=10m
echo "✅ Deployments ready"
echo ""

# Step 7: Get service info
echo "📋 Service information:"
echo "----------------------"
kubectl get services -n "$NAMESPACE"
echo ""

echo "🌐 Inference endpoint:"
INFERENCE_IP=$(kubectl get service babylon-inference -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
if [ -n "$INFERENCE_IP" ]; then
    echo "  http://$INFERENCE_IP"
else
    echo "  Waiting for LoadBalancer IP..."
fi
echo ""

# Step 8: Show logs
echo "📝 Recent logs:"
echo "--------------"
kubectl logs -n "$NAMESPACE" deployment/babylon-training --tail=20
echo ""

echo "✅ Deployment complete!"
echo ""
echo "📊 Monitor with:"
echo "  kubectl get pods -n $NAMESPACE -w"
echo "  kubectl logs -n $NAMESPACE -f deployment/babylon-training"
echo "  kubectl logs -n $NAMESPACE -f deployment/babylon-inference"
echo ""
echo "🔧 Manage with:"
echo "  kubectl get all -n $NAMESPACE"
echo "  kubectl describe deployment babylon-training -n $NAMESPACE"
echo "  kubectl scale deployment babylon-inference --replicas=4 -n $NAMESPACE"



