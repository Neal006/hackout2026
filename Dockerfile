FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY noonshift ./noonshift
COPY data ./data
CMD ["uvicorn", "noonshift.api:app", "--host", "0.0.0.0", "--port", "8000"]
