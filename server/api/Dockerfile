FROM python:3.13-alpine

WORKDIR /app
COPY server/api/server.py /app/server.py

RUN mkdir -p /data && chown nobody:nogroup /data

EXPOSE 8080

USER nobody

CMD ["python", "/app/server.py"]
