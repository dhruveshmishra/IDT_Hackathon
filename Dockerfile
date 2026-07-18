# Use official Node.js runtime as a parent image
FROM node:24-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Expose ports (3000, 3001, 3002)
EXPOSE 3000 3001 3002

# Start the application
CMD ["node", "app.js"]
