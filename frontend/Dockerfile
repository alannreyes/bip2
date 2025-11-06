FROM node:20

WORKDIR /app

# Variables
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NODE_ENV=development

# Instalar dependencias
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copiar código
COPY . .

# Build - mostrar TODO el output
RUN npm run build 2>&1

# Runtime
ENV NODE_ENV=production
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
