<CsoundSynthesizer>
<CsOptions>
-n -d -m0 -r48000 -k100 --0dbfs=0.5
</CsOptions>
<CsInstruments>
sr      = 48000
ksmps   = 480
kr      = 100
nchnls  = 2
0dbfs   = 0.5

giSine      = 1
giCosine    = 2
giPadBlend  = 3
giGrainEnv  = 4
giMelody    = 5

; =========================================
; Instrument 1: Subtractive drone bed
; =========================================
instr 1
    iFreq      = cpsmidinn(p4)
    iAmp       = p5
    kEnv       linseg 0, 4, 1, p3 - 8, 1, 4, 0
    kDrift     randh  40, 0.05
    aSaw1      vco2   iAmp, iFreq
    aSaw2      vco2   iAmp * 0.8, iFreq * 0.5
    aSaw3      vco2   iAmp * 0.6, iFreq * 1.5
    aStack     = (aSaw1 + aSaw2 + aSaw3) * 0.33
    kCutBase   expseg 400, p3, 2200
    kCut       = kCutBase + kDrift
    aFiltered  moogladder aStack, kCut, 0.25
    aL, aR     pan2 aFiltered * kEnv, p6
    outs       aL, aR
endin

; =========================================
; Instrument 2: Partikkel-based granular pads
; =========================================
instr 2
    iFreq         = cpsmidinn(p4)
    iDur          = p3
    kEnv          linseg 0, 3, 1, iDur - 6, 1, 3, 0
    kGrainFreq    = 75
    kDistribution = 0.3
    iDistTab      = -1
    aSync         init 0
    kEnv2Amt      = 0.45
    iEnv2Tab      = giGrainEnv
    iEnvAttack    = giGrainEnv
    iEnvDecay     = giGrainEnv
    kSustain      = 0.7
    kADR          = 0.5
    kDuration     = 200
    kAmp          = p5
    iGainMasks    = -1
    kWaveFreq     = iFreq
    kSweepShape   = 0.25
    iWavFreqStart = -1
    iWavFreqEnd   = -1
    aWavFM        init 0
    iFmAmpTab     = -1
    kFmEnv        = -1
    iCosine       = giCosine
    kTrainCps     = kGrainFreq * 0.5
    kNumPartials  = 6
    kChroma       = 0.85
    iChannelMasks = -1
    kRandMask     linseg 0.1, iDur, 0.4
    kWaveform1    = giSine
    kWaveform2    = giSine
    kWaveform3    = giSine
    kWaveform4    = giSine
    iWaveAmpTab   = -1
    kSamplePos    linseg 0, iDur, 0.5
    aSamplePos    interp kSamplePos
    kWaveKey1     = 60
    kWaveKey2     = 67
    kWaveKey3     = 64
    kWaveKey4     = 72
    iMaxGrains    = 120
    aSig partikkel kGrainFreq, kDistribution, iDistTab, aSync, kEnv2Amt, iEnv2Tab, iEnvAttack, iEnvDecay, \
                   kSustain, kADR, kDuration, kAmp, iGainMasks, kWaveFreq, kSweepShape, iWavFreqStart, iWavFreqEnd, aWavFM, \
                   iFmAmpTab, kFmEnv, iCosine, kTrainCps, kNumPartials, kChroma, iChannelMasks, kRandMask, \
                   kWaveform1, kWaveform2, kWaveform3, kWaveform4, iWaveAmpTab, \
                   aSamplePos, aSamplePos, aSamplePos, aSamplePos, \
                   kWaveKey1, kWaveKey2, kWaveKey3, kWaveKey4, iMaxGrains
    kPan          oscili 0.45, 0.015, giPadBlend
    aL, aR        pan2 aSig * kEnv, 0.5 + kPan * 0.5
    outs          aL, aR
endin

; =========================================
; Instrument 3: FM sparkles with delay + reverb chain
; =========================================
instr 3
    iBase      = cpsmidinn(p4)
    kEnv       expseg 0.0001, 0.5, 1, p3 - 1, 0.4, 0.5, 0.0001
    kModIndex  linseg 3, p3, 1
    aMod       oscili kModIndex * 200, iBase * 2.01, giSine
    aCar       foscil p5 * kEnv, iBase, 1.5, aMod, 1
    aSprinkle  butterhp aCar, 1500
    aPannedL, aPannedR pan2 aSprinkle, p6
    aDelayL    vdelay aPannedL, 320, 4000
    aDelayR    vdelay aPannedR, 450, 4000
    aSumL      = aPannedL * 0.7 + aDelayR * 0.3
    aSumR      = aPannedR * 0.7 + aDelayL * 0.3
    aRevL, aRevR freeverb aSumL, aSumR, 0.72, 0.3
    outs       aRevL, aRevR
endin

; =========================================
; Instrument 4: Plucked fragments through band-pass
; =========================================
instr 4
    iIdx       = p4
    iDur       = p3
    kEnv       linseg 0, 0.2, 1, iDur - 0.4, 1, 0.2, 0
    iNote      = table(iIdx, giMelody)
    iFreq      = cpsmidinn(iNote)
    kFreq      init iFreq
    kAmp       init p5
    aPluck     pluck kAmp, kFreq, iFreq, 0, 1
    kSweep     expseg 600, iDur, 1600
    aFiltered  butbp aPluck, kSweep, 80
    aL, aR     pan2 aFiltered * kEnv, p6
    outs       aL, aR
endin

</CsInstruments>
<CsScore>
f0 60
; Shared tables for instrument control
f1 0 65537 10 1
f2 0 8193 9 1 1 90
f3 0 1025 16 0 1024 1
f4 0 4097 20 2
f5 0 8 -2 55 58 62 60 67 65 62 55

; Drone foundation (Instrument 1)
i1 0 60 48 0.18 0.35

; Granular pads emerging (Instrument 2)
i2 8 48 55 0.22

; FM sparkles (Instrument 3) - staggered gestures
 i3 12 6 79 0.16 0.2
 i3 20 7 84 0.14 0.7
 i3 34 5 76 0.15 0.4
 i3 44 8 88 0.13 0.6

; Plucked melodic fragments (Instrument 4)
i4 16 4 0 0.12 0.25
 i4 22 5 1 0.1 0.75
 i4 30 6 3 0.11 0.4
 i4 38 5 5 0.13 0.6
 i4 48 6 7 0.12 0.35

</CsScore>
</CsoundSynthesizer>
