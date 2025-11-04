#!/bin/bash

# ==============================================
# BIP2 Quick Deploy Script for Portainer
# ==============================================
# This script helps you quickly set up environment
# variables and validate the deployment
# ==============================================

set -e

echo "=================================="
echo "BIP2 Quick Deploy for Portainer"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if .env.portainer exists
if [ ! -f ".env.portainer" ]; then
    echo "Error: .env.portainer not found!"
    exit 1
fi

echo "This script will help you prepare for Portainer deployment."
echo ""

# Ask for GEMINI_API_KEY
print_info "Enter your Gemini API Key (or press Enter to configure later):"
read -r GEMINI_KEY

# Ask for JWT_SECRET
print_info "Enter your JWT Secret (or press Enter to generate one):"
read -r JWT_SECRET

if [ -z "$JWT_SECRET" ]; then
    print_info "Generating a secure JWT secret..."
    # Try multiple methods for secure random generation
    if command -v openssl &> /dev/null; then
        JWT_SECRET=$(openssl rand -base64 32)
        echo "Generated JWT Secret using openssl"
    elif [ -f /dev/urandom ]; then
        JWT_SECRET=$(head -c 32 /dev/urandom | base64)
        echo "Generated JWT Secret using /dev/urandom"
    else
        print_warning "Cannot generate secure JWT secret automatically."
        print_warning "Please enter a secure JWT secret manually (minimum 32 characters):"
        read -r JWT_SECRET
        if [ -z "$JWT_SECRET" ]; then
            echo "Error: JWT_SECRET is required for deployment."
            exit 1
        fi
    fi
fi

# Create a temporary .env file for reference
ENV_FILE=".env.portainer.generated"
cat > "$ENV_FILE" << EOF
# ==============================================
# PORTAINER DEPLOYMENT - BIP2 Configuration
# Generated on: $(date)
# ==============================================

# REQUIRED VARIABLES
GEMINI_API_KEY=${GEMINI_KEY:-your_gemini_api_key_here}
JWT_SECRET=${JWT_SECRET}

# OPTIONAL VARIABLES (Azure AD)
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=

# ==============================================
# INSTRUCTIONS FOR PORTAINER:
# 1. Copy these variables to Portainer's Environment Variables section
# 2. Go to Stacks → Add Stack → Web Editor
# 3. Paste PORTAINER_DOCKER_COMPOSE.yml content
# 4. Add these environment variables in the UI
# 5. Deploy the stack
# ==============================================
EOF

print_success "Environment configuration created: $ENV_FILE"
echo ""

# Display the variables
echo "=================================="
echo "Environment Variables Summary"
echo "=================================="
cat "$ENV_FILE"
echo ""

# Run validation
print_info "Running deployment validation..."
echo ""

if [ -x "./validate-deployment.sh" ]; then
    ./validate-deployment.sh
else
    echo "Warning: validate-deployment.sh not found or not executable"
fi

echo ""
echo "=================================="
echo "Next Steps"
echo "=================================="
echo "1. Review the generated file: $ENV_FILE"
echo "2. Access your Portainer instance"
echo "3. Create a new Stack"
echo "4. Copy the content from PORTAINER_DOCKER_COMPOSE.yml"
echo "5. Add the environment variables from $ENV_FILE"
echo "6. Deploy!"
echo ""
echo "For detailed instructions, see: PORTAINER_COMPLETE_GUIDE.md"
echo ""

print_success "Ready for Portainer deployment!"
