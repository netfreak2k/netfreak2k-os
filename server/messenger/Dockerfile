FROM python:3.12-slim
WORKDIR /app
RUN useradd --system --uid 10001 --home /state n2kmessenger && mkdir -p /state && chown 10001:10001 /state
RUN pip install --no-cache-dir rns lxmf
COPY server/messenger/service.py /app/service.py
USER 10001:10001
EXPOSE 8091
CMD ["python","/app/service.py"]
