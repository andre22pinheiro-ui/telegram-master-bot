# Dockerfile — Telegram Master Bot em Produção na Nuvem
FROM node:20-alpine

# Instalar dependências de sistema necessárias para SQLite e compilação
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copiar ficheiros de manifesto para cache de camadas
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --omit=dev

# Copiar código fonte
COPY . .

# Garantir existência das pastas de dados e uploads
RUN mkdir -p data logs public

# Expor a porta HTTP
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Executar o @AndrePinheirobot 100% Cloud-Native
CMD ["node", "index.js"]

