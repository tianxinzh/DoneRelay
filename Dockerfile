# Optional isolated development/test environment. Product installs use the local skill bundle.
FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
USER node
ENV NPM_CONFIG_CACHE=/tmp/npm-cache
CMD ["npm", "test"]
