FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=8787 DONERELAY_STATE_FILE=/app/data/state.json
EXPOSE 8787
CMD ["node", "src/cli.js", "serve"]
