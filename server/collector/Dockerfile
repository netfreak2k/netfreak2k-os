FROM python:3.13-alpine

WORKDIR /app
COPY server/collector/collector.py /app/collector.py

RUN mkdir -p /state && chown nobody:nogroup /state

USER nobody

CMD ["python", "/app/collector.py"]
