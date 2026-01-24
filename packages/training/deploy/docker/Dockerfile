# Babylon Training Production Image
#
# FAST BUILD (~2 minutes) - extends pre-built base image
#
# Prerequisites:
#   1. Build and push the base image first:
#      docker build -f deploy/docker/Dockerfile.base -t yourorg/babylon-base:0.2.0 .
#      docker push yourorg/babylon-base:0.2.0
#
#   2. Set the BASE_IMAGE build arg or update the default below
#
# Build:
#   docker build -f deploy/docker/Dockerfile \
#     --build-arg BASE_IMAGE=yourorg/babylon-base:0.2.0 \
#     -t babylon-training:latest .
#
# Build with model pre-download:
#   docker build -f deploy/docker/Dockerfile \
#     --build-arg BASE_IMAGE=yourorg/babylon-base:0.2.0 \
#     --build-arg PRELOAD_MODEL=Qwen/Qwen2.5-0.5B-Instruct \
#     -t babylon-training:0.5b .
#
# ============================================================================
ARG BASE_IMAGE=revlentless/babylon-base:0.2.0
FROM ${BASE_IMAGE}

WORKDIR /app

# Copy requirements first (for layer caching)
COPY python/requirements.txt ./requirements.txt

# Install any additional requirements not in base
# This should be fast - most deps are already in base
# Note: Fails loudly if requirements.txt has issues - this is intentional
RUN pip install --no-cache-dir -r requirements.txt

# Copy scripts
COPY deploy/docker/scripts/ /app/scripts/
RUN chmod +x /app/scripts/*.sh

# Copy application code
COPY python/ ./python/
COPY Makefile ./Makefile
COPY config/ ./config/

# Install the training package
RUN cd python && pip install -e .

# Create db directory (for optional migrations)
RUN mkdir -p ./db

# Optional: Pre-download model weights
ARG PRELOAD_MODEL=""
RUN if [ -n "$PRELOAD_MODEL" ]; then \
    echo "Pre-downloading model: $PRELOAD_MODEL" && \
    python3 -c "from transformers import AutoTokenizer, AutoModelForCausalLM; \
        print('Downloading tokenizer...'); \
        AutoTokenizer.from_pretrained('$PRELOAD_MODEL', trust_remote_code=True); \
        print('Downloading model (this takes a while)...'); \
        AutoModelForCausalLM.from_pretrained('$PRELOAD_MODEL', trust_remote_code=True, torch_dtype='auto')" && \
    echo "Model pre-downloaded successfully"; \
    fi

# Runtime environment
ENV DATABASE_URL=""
ENV WANDB_API_KEY=""
ENV WANDB_PROJECT="babylon-training"
ENV WANDB_MODE="offline"

# Health check
HEALTHCHECK --interval=60s --timeout=30s --start-period=120s --retries=3 \
    CMD python3 -c "import torch; assert torch.cuda.is_available()" || exit 1

# Entrypoint
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["python3", "python/scripts/run_training.py", "--help"]
