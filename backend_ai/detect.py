import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "No file provided"
        }))
        return

    file_path = sys.argv[1]


    if not os.path.exists(file_path):
        print(json.dumps({
            "success": False,
            "error": "File not found" 
        }))
        return
    
    if not file_path.endswith(".wav"):
        print(json.dumps({
            "success": False,
            "error": "Invalid file type"
        }))
        return
    
    file_size = os.path.getsize(file_path)
    if file_size < 1000:
        print(json.dumps({
            "success": False,
            "error": "audio too short"
        }))
        return
    
    text = "ช่วยด้วย"

    if "ช่วยด้วย" in text:
        risk = 3
        keyword = "ช่วยด้วย"
    else:
        risk = 1
        keyword = None

    result = {
        "success": True,
        "transcribedText": text,
        "keyword": keyword,
        "riskLevel": risk,
        "error": None
    }

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()