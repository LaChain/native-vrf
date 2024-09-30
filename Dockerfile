FROM node:20 AS base

# Set the working directory in the container to /app
WORKDIR /app

# Copy the package.json file to the working directory
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json

# Install the dependencies
RUN npm install

# Copy only the necessary files to the working directory
COPY . /app

# Hardhat compile
RUN npm run compile
RUN npx tsc /app/index.ts --resolveJsonModule

FROM node:20 AS production

WORKDIR /app

COPY --from=base /app/index.js /app/index.js
COPY --from=base /app/package.json /app/package.json
COPY --from=base /app/package-lock.json /app/package-lock.json
COPY --from=base /app/artifacts/contracts/NativeVRF.sol/NativeVRF.json /app/artifacts/contracts/NativeVRF.sol/NativeVRF.json

RUN npm install --only=production

CMD ["node", "index.js"]
