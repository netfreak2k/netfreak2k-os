FROM python:3.13-alpine

WORKDIR /app
COPY server/api/server.py /app/server.py

RUN pip install --no-cache-dir mutagen==1.47.0

RUN mkdir -p /data && chown nobody:nogroup /data

EXPOSE 8080

USER nobody

CMD ["python", "/app/server.py"]
