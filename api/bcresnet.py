import torch
import torch.nn as nn
import torch.nn.functional as F

class SubSpectralNorm(nn.Module):
    def __init__(self, channels, sub_bands):
        super(SubSpectralNorm, self).__init__()
        self.sub_bands = sub_bands
        self.bn = nn.BatchNorm2d(channels * sub_bands)

    def forward(self, x):
        N, C, F_dim, T = x.size()
        
        # --- Safety Check added here ---
        if F_dim % self.sub_bands != 0:
            raise ValueError(f"Frequency dimension ({F_dim}) must be perfectly divisible by sub_bands ({self.sub_bands}). Check your n_mels or conv strides.")
        
        # Split frequency dimension into sub-bands
        x = x.view(N, C * self.sub_bands, F_dim // self.sub_bands, T)
        x = self.bn(x)
        return x.view(N, C, F_dim, T)


class BCBlock(nn.Module):
    def __init__(self, in_channels, out_channels, stride, dilation=1):
        super(BCBlock, self).__init__()
        # Transition: 1x1 Conv if channel size changes or stride > 1
        self.transition = None
        if in_channels != out_channels or stride != 1:
            self.transition = nn.Conv2d(in_channels, out_channels, kernel_size=1, stride=(1, stride), bias=False)
            
        # Depthwise 1D Convolution over Time
        self.dw_conv = nn.Conv2d(
            in_channels, in_channels, kernel_size=(1, 3), 
            stride=(1, stride), padding=(0, dilation), dilation=(1, dilation), 
            groups=in_channels, bias=False
        )
        
        # --- FIX: Changed sub_bands to 4 so it neatly divides 64 (from 128 mels) ---
        self.ssn = SubSpectralNorm(in_channels, sub_bands=4) 
        
        self.exc_conv = nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False)
        
        # Pointwise Conv over Frequency
        self.pw_conv = nn.Conv2d(out_channels, out_channels, kernel_size=(1, 1), bias=False)
        self.bn = nn.BatchNorm2d(out_channels)

    def forward(self, x):
        identity = x if self.transition is None else self.transition(x)
        
        out = self.dw_conv(x)
        out = self.ssn(out)
        out = self.exc_conv(out)
        out = F.silu(out) 
        
        out_freq = torch.mean(out, dim=2, keepdim=True)
        
        out_freq = self.pw_conv(out_freq)
        out_freq = self.bn(out_freq)
        
        out = out * torch.sigmoid(out_freq)
        return F.silu(out + identity)


class BCResNet1(nn.Module):
    def __init__(self, num_classes=2):
        super(BCResNet1, self).__init__()
        self.conv1 = nn.Conv2d(1, 8, kernel_size=(5, 5), stride=(2, 1), padding=(2, 2), bias=False)
        self.bn1 = nn.BatchNorm2d(8)
        
        self.block1 = BCBlock(8, 16, stride=1)
        self.block2 = BCBlock(16, 24, stride=2)
        self.block3 = BCBlock(24, 32, stride=2)
        self.block4 = BCBlock(32, 48, stride=1)
        
        self.dw_conv_final = nn.Conv2d(48, 48, kernel_size=(5, 5), groups=48, bias=False)
        self.bn_final = nn.BatchNorm2d(48)
        self.fc = nn.Linear(48, num_classes)

    def forward(self, x):
        x = F.silu(self.bn1(self.conv1(x)))
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        x = F.silu(self.bn_final(self.dw_conv_final(x)))
        x = F.adaptive_avg_pool2d(x, (1, 1)).squeeze(-1).squeeze(-1)
        return self.fc(x)

    
class BCResNet_Tiny(nn.Module):
    def __init__(self, num_classes=2):
        super(BCResNet_Tiny, self).__init__()
        self.conv1 = nn.Conv2d(1, 8, kernel_size=(5, 5), stride=(2, 1), padding=(2, 2), bias=False)
        self.bn1 = nn.BatchNorm2d(8)
        
        self.block1 = BCBlock(8, 8, stride=1)      
        self.block2 = BCBlock(8, 12, stride=2)     
        self.block3 = BCBlock(12, 16, stride=2)    
        self.block4 = BCBlock(16, 24, stride=1)    
        
        self.dw_conv_final = nn.Conv2d(24, 24, kernel_size=(5, 5), groups=24, bias=False)
        self.bn_final = nn.BatchNorm2d(24)
        self.fc = nn.Linear(24, num_classes)

    def forward(self, x):
        x = F.silu(self.bn1(self.conv1(x)))
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        x = F.silu(self.bn_final(self.dw_conv_final(x)))
        x = F.adaptive_avg_pool2d(x, (1, 1)).squeeze(-1).squeeze(-1)
        return self.fc(x)


class BCResNet_M(nn.Module):
    def __init__(self, num_classes=2):
        super(BCResNet_M, self).__init__()
        self.conv1 = nn.Conv2d(1, 8, kernel_size=(5, 5), stride=(2, 1), padding=(2, 2), bias=False)
        self.bn1 = nn.BatchNorm2d(8)
        
        self.block1 = BCBlock(8, 8, stride=1)      
        self.block2 = BCBlock(8, 16, stride=2)     
        self.block3 = BCBlock(16, 24, stride=2)    
        self.block4 = BCBlock(24, 32, stride=1)    
        
        # --- FIX: Updated the final layers from 24 to 48 to match block4 output ---
        self.dw_conv_final = nn.Conv2d(32, 32, kernel_size=(5, 5), groups=32, bias=False)
        self.bn_final = nn.BatchNorm2d(32)
        self.fc = nn.Linear(32, num_classes)

    def forward(self, x):
        x = F.silu(self.bn1(self.conv1(x)))
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        x = F.silu(self.bn_final(self.dw_conv_final(x)))
        x = F.adaptive_avg_pool2d(x, (1, 1)).squeeze(-1).squeeze(-1)
        return self.fc(x)