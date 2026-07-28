import base64
from PIL import Image
import os

input_file = "input.jpg"
output_file = "background.svg"

# Open the image to get its dimensions
with Image.open(input_file) as img:
    width, height = img.size
    # Convert to RGB if it's not (though for base64 PNG it doesn't strictly matter if we embed it as PNG, but let's check format)
    fmt = img.format.lower() if img.format else 'png'

# Read the image file and encode it to base64
with open(input_file, "rb") as f:
    encoded_string = base64.b64encode(f.read()).decode('utf-8')

mime_type = f"image/{fmt}"

# Create the SVG content with the embedded base64 image
svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%">
  <image href="data:{mime_type};base64,{encoded_string}" width="{width}" height="{height}" />
</svg>"""

# Save to the output file
with open(output_file, "w", encoding='utf-8') as f:
    f.write(svg_content)

print(f"Generated SVG: {output_file}")