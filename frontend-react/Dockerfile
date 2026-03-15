# syntax=docker/dockerfile:1

# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code and config files
COPY . .

# Build the production bundle
# In a real environment, VITE_API_URL would be injected here
ENV VITE_API_URL=http://localhost:5001
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Copy the built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy a custom nginx config to handle React Router push-state routing
RUN cat <<EOF > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Expose the HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
