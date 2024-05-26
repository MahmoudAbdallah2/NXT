# Use a minimal base image
FROM node:16-alpine

# Create and switch to a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create the app directory and set the correct permissions
WORKDIR /app
RUN chown appuser:appgroup /app

# Switch to the non-root user
USER appuser

# Copy application files to the container
COPY package*.json ./
COPY app.js ./

# Install dependencies
RUN npm install --production

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
