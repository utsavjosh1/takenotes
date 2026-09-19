# takenotes self-hosted server (Gate C).
# Desktop stays the primary host; this image is the second host/transport only.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Full install here: esbuild (devDep) bundles the server; the runtime stage
# ships only the self-contained bundle, no node_modules at all.
RUN npm ci
COPY src ./src
COPY scripts ./scripts
RUN node scripts/build-server.mjs

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    TAKENOTES_DATA=/data \
    TAKENOTES_PORT=3000
WORKDIR /app
COPY --from=build /app/dist-server/server.cjs ./server.cjs
COPY package.json ./package.json
# Non-root process; /data is the only writable mount.
RUN useradd --system --create-home --home-dir /home/takenotes takenotes \
  && mkdir -p /data /home/takenotes \
  && chown -R takenotes:takenotes /app /data /home/takenotes
USER takenotes
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.TAKENOTES_PORT||'3000')+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "/app/server.cjs"]
