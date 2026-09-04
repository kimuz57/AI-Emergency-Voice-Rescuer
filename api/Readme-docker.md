# Build
```
docker build -t kws-service .
```

# Run Container
```
docker run -d -p 8000:8000 -v "${PWD}:/app" -v /app/.venv --name kws-app kws-service
```
