FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8000
EXPOSE 8000
# Railway (and most hosts) pass the port in $PORT; locally it falls back to 8000.
CMD ["sh", "-c", "exec gunicorn -b 0.0.0.0:${PORT} -w 2 --threads 4 --timeout 900 --access-logfile - app:app"]
