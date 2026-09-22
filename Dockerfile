FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN groupadd --gid 10001 filmboard && useradd --uid 10001 --gid filmboard --no-create-home filmboard \
    && mkdir /app/data && chown filmboard:filmboard /app/data
COPY server.py ./
COPY web ./web
USER filmboard
EXPOSE 8780
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8780"]
