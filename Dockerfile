FROM node:22-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node skills ./skills
RUN mkdir -p /data && chown node:node /data
USER node
ENV DONERELAY_HOST=0.0.0.0 DONERELAY_DATA_DIR=/data
EXPOSE 8787
CMD ["node", "src/cli.mjs", "serve"]
