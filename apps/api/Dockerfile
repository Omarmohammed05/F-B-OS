FROM python:3.12-slim

WORKDIR /app

# Dependencies live in the image; application source is bind-mounted at run time
# so edits are picked up by uvicorn --reload.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
