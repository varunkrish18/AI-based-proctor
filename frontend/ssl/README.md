# SSL Certificates

Place your SSL certificates here for the Nginx HTTPS reverse proxy:
- `proctor.crt`
- `proctor.key`

### Generating a Self-Signed Certificate:
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout frontend/ssl/proctor.key \
  -out frontend/ssl/proctor.crt \
  -subj "/CN=proctor"
```

*Note: Private keys (*.key) are ignored by git for security.*
