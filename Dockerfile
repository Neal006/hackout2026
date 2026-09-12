FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY noonshift ./noonshift
COPY data ./data
# Render injects PORT; compose overrides this command anyway
CMD uvicorn noonshift.api:app --host 0.0.0.0 --port ${PORT:-8000}
