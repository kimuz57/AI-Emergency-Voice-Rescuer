import torch
import torch.nn as nn
import torch.nn.functional as F

class SubSpectralNorm(nn.Module):
    def __init__(self, channels, sub_groups=2):
        super().__init__()
        self.groups = sub_groups
        self.bn = nn.BatchNorm2d(channels * sub_groups)

    def forward(self, x):
        b, c, f, t = x.shape
        x = x.view(b, c * self.groups, f // self.groups, t)
        x = self.bn(x)
        return x.view(b, c, f, t)

class BCResBlock(nn.Module):
    def __init__(self, in_channels, out_channels, stride=1, dilation=1, dropout=0.1):
        super().__init__()
        self.stride = stride
        
        # Frequency-wise Convolution
        self.f_conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=(3, 1), 
                      stride=(stride, 1), padding=(dilation, 0), dilation=(dilation, 1), bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )
        
        # Time-wise Convolution (Depthwise)
        self.t_conv = nn.Sequential(
            nn.Conv2d(out_channels, out_channels, kernel_size=(1, 3), 
                      stride=1, padding=(0, 1), groups=out_channels, bias=False),
            nn.BatchNorm2d(out_channels),
        )
        
        # Global Information Broadcasting
        self.gc = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, None)),
            nn.Conv2d(out_channels, out_channels, kernel_size=1),
            nn.Sigmoid()
        )
        
        self.dropout = nn.Dropout(dropout)
        
        # Shortcut connection
        self.shortcut = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, stride=(stride, 1), bias=False),
                nn.BatchNorm2d(out_channels)
            )

    def forward(self, x):
        residual = self.shortcut(x)
        
        out = self.f_conv(x)
        
        # Broadcasting logic
        context = self.gc(out)
        out = out * context
        
        out = self.t_conv(out)
        out = self.dropout(out)
        
        out += residual
        return F.relu(out)

class BCResNet(nn.Module):
    def __init__(self, num_classes=8, dropout=0.1):
        super(BCResNet, self).__init__()
        
        # Initial Convolution
        self.conv1 = nn.Conv2d(1, 16, kernel_size=5, stride=2, padding=2, bias=False)
        self.bn1 = nn.BatchNorm2d(16)
        
        # BC-ResNet Stages
        self.layer1 = self._make_layer(16, 16, blocks=2, stride=1)
        self.layer2 = self._make_layer(16, 24, blocks=2, stride=2)
        self.layer3 = self._make_layer(24, 32, blocks=3, stride=2)
        self.layer4 = self._make_layer(32, 48, blocks=3, stride=1) # เน้นเก็บรายละเอียดใน Stage ท้าย
        
        # Final Classification Header
        self.conv2 = nn.Conv2d(48, 64, kernel_size=1, bias=False)
        self.bn2 = nn.BatchNorm2d(64)
        
        self.avgpool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Linear(64, num_classes)

    def _make_layer(self, in_channels, out_channels, blocks, stride):
        layers = []
        layers.append(BCResBlock(in_channels, out_channels, stride))
        for _ in range(1, blocks):
            layers.append(BCResBlock(out_channels, out_channels))
        return nn.Sequential(*layers)

    def forward(self, x):
        # Input x: [Batch, 1, Freq, Time]
        x = F.relu(self.bn1(self.conv1(x)))
        
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        
        x = F.relu(self.bn2(self.conv2(x)))
        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        x = self.fc(x)
        return x

def get_model(num_classes=8):
    return BCResNet(num_classes=num_classes)