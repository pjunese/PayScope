import requests
from io import BytesIO
from PIL import Image

img = Image.new('RGB', (100, 100), color='white')
buf = BytesIO()
img.save(buf, format='JPEG')
buf.seek(0)

files = {
    'file': ('test.jpg', buf.read(), 'application/octet-stream'),
    'message': (None, '{"version":"V2","requestId":"test","timestamp":0,"images":[{"format":"jpg","name":"test.jpg"}]}', 'application/json')
}
resp = requests.post(
    "https://clovaocr-api-kr.ncloud.com/external/v1/47953/4130f50191f4d39ea7d16297c81aa14a8095220a17bee0be13badcd19b1796ab",
    headers={"X-OCR-SECRET": "VXJ2UExPUnBuWExPbUthbm1OUmJRZ09pdmRMTHlMS04="},
    files=files,
    timeout=15,
)
print(resp.status_code)
print(resp.text[:200])
