FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY . .
# v3 build - Make.com webhooks only, no Resend fallback
RUN npm run build
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production
CMD ["node", "dist/index.cjs"]
