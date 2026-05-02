FROM node:20-alpine

WORKDIR /app

# Install openssl and dos2unix for Prisma and line-ending fixes
RUN apk add --no-cache openssl dos2unix

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code and Prisma schema
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose the API port
EXPOSE 3001

# Fix Windows CRLF line endings and make entrypoint executable
RUN dos2unix entrypoint.sh && chmod +x entrypoint.sh

# Use the entrypoint script
ENTRYPOINT ["./entrypoint.sh"]
