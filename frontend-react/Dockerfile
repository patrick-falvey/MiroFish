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
# We leave VITE_API_BASE_URL empty so the frontend calls /api relative to the current origin.
# Nginx will then proxy those /api requests to the backend.
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Copy the built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy a custom nginx config to handle React Router push-state routing and API proxying
RUN cat <<EOF > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    
    location /api/ {
        proxy_pass http://backend:5001/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

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
