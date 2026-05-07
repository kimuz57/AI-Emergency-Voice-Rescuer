package services

import (
    "encoding/json"
    "fmt"
    "os/exec"
    "path/filepath"
)

type DetectResult struct {
    Success         bool    `json:"success"`
    IsAlert         int     `json:"isAlert"`
    Keyword         string  `json:"keyword"`
    Level           int     `json:"level"`
    Confidence      float64 `json:"confidence"`
    TranscribedText string  `json:"transcribedText"`
    ProcessingTime  int     `json:"processingTime"`
    Error           string  `json:"error,omitempty"`
}

func RunDetect(audioPath string) (DetectResult, error) {
    pythonPath := filepath.Join("..", ".venv", "Scripts", "python.exe")
    scriptPath := filepath.Join("..", "backend_ai", "detect.py")

    cmd := exec.Command(pythonPath, scriptPath, audioPath)
    output, err := cmd.CombinedOutput()

    var result DetectResult
    if parseErr := json.Unmarshal(output, &result); parseErr != nil {
        return DetectResult{}, fmt.Errorf("failed to parse detect.py output: %v | raw: %s", parseErr, string(output))
    }

    if err != nil && !result.Success {
        return result, nil
    }

    return result, err
}