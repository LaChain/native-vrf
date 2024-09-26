FROM node:20 as base

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

FROM node:20 as production

WORKDIR /app

COPY --from=base /app/package.json /app/package.json
COPY --from=base /app/package-lock.json /app/package-lock.json
COPY --from=base /app/hardhat.config.ts /app/hardhat.config.ts
COPY --from=base /app/typechain /app/typechain
COPY --from=base /app/scripts/examples/fulfill-bot.ts /app/scripts/examples/fulfill-bot.ts
COPY --from=base /app/utils /app/utils
COPY --from=base /app/addressList /app/addressList
COPY --from=base /app/node_modules /app/node_modules

CMD ["npx", "hardhat", "run", "scripts/examples/fulfill-bot.ts"]
