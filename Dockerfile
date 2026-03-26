FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY . .
# DO NOT run npm run build - use pre-committed dist/ to keep asset hashes stable
# Running build inside Docker creates different hashes that confuse Railway CDN
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production
CMD ["node", "dist/index.cjs"]
