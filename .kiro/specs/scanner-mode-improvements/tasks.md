# Implementation Plan

## Overview

Tasks untuk bugfix scanner-mode-improvements mengikuti exploratory bugfix workflow:
1. **Explore** - Tulis tests SEBELUM fix untuk memahami bug (Bug Condition)
2. **Preserve** - Tulis tests untuk behavior non-buggy (Preservation Requirements)
3. **Implement** - Terapkan fix berdasarkan pemahaman (Expected Behavior)
4. **Validate** - Verifikasi fix bekerja dan tidak merusak existing behavior

---

## Phase 1: Bug Condition Exploration Tests

- [x] 1. Write bug condition exploration test - UI Layout
  - **Property 1: Bug Condition** - Camera Preview Not Fullscreen
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate the UI bug exists
  - **Scoped PBT Approach**: Verify that camera preview uses aspectRatio 4/3 with height < deviceHeight * 0.9
  - Test implementation: Check camera container element has `aspectRatio: "4/3"` style
  - Test implementation: Verify visible control count > 2 (zoom slider, torch button, stop button)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (confirms UI is not fullscreen/optimized)
  - Document counterexamples: "Camera preview uses 4/3 aspect ratio, controls count: 3+"
  - _Requirements: 1.1, 1.2_

- [~] 2. Write bug condition exploration test - Quagga2 Configuration
  - **Property 1: Bug Condition** - Suboptimal Quagga2 Config for Small Barcodes
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **GOAL**: Surface counterexamples that demonstrate the config bug exists
  - **Scoped PBT Approach**: Verify Quagga config has `halfSample: true` and `patchSize: "medium"`
  - Test implementation: Check `initQuagga` function uses problematic config values
  - Test implementation: Verify `frequency: 10` is too low for responsive detection
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (confirms config is suboptimal)
  - Document counterexamples: "halfSample=true reduces detail, patchSize='medium' misses small barcodes"
  - _Requirements: 1.6, 2.6_

- [~] 3. Write bug condition exploration test - iOS Compatibility
  - **Property 1: Bug Condition** - Missing iOS Safari Compatibility
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **GOAL**: Surface counterexamples that demonstrate iOS handling is missing
  - **Scoped PBT Approach**: Verify no video readyState check before Quagga init
  - Test implementation: Check `startScanner` doesn't wait for `video.readyState >= 3`
  - Test implementation: Verify no user gesture handling for iOS
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (confirms iOS compatibility missing)
  - Document counterexamples: "Quagga init called without video ready state check"
  - _Requirements: 1.4, 2.4_

---

## Phase 2: Preservation Property Tests

- [~] 4. Write preservation property tests - Navigation Flow
  - **Property 2: Preservation** - Navigation After Scan
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: After barcode detection, `navigate('/return-form?barcode=...')` is called
  - Write property-based test: For any valid barcode detected, navigation occurs with correct params
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms baseline navigation behavior)
  - _Requirements: 3.1_

- [~] 5. Write preservation property tests - Product Search
  - **Property 2: Preservation** - Product Search Dropdown
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Product search filters products and allows selection
  - Observe: Selecting product navigates to return form with barcode param
  - Write property-based test: For any product in list, selection triggers navigation
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms product search works)
  - _Requirements: 3.2_

- [~] 6. Write preservation property tests - Manual Input
  - **Property 2: Preservation** - Manual Barcode Input
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Manual input field accepts barcode and submits on Enter
  - Observe: Submit triggers navigation to return form
  - Write property-based test: For any valid manual input, navigation occurs
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms manual input works)
  - _Requirements: 3.4_

- [~] 7. Write preservation property tests - Error Handling
  - **Property 2: Preservation** - Error Messages
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Permission denied shows informative error message
  - Observe: Camera not found shows appropriate error
  - Write property-based test: For any error condition, appropriate message is displayed
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test PASSES (confirms error handling works)
  - _Requirements: 3.5_

---

## Phase 3: Implementation - Phase 1 UI Restructure

- [ ] 8. Fix for UI - Fullscreen Camera Preview
  - [~] 8.1 Implement fullscreen scanner container
    - Remove card-based layout for scanner area
    - Create fullscreen overlay when scanner is active
    - Apply `position: fixed; inset: 0` for fullscreen coverage
    - Add safe area insets for notch/home indicator (iOS)
    - _Bug_Condition: input.cameraPreviewAspectRatio = 4/3 AND input.cameraPreviewHeight < deviceHeight * 0.6_
    - _Expected_Behavior: Camera preview fills 100% of screen with optimal aspect ratio_
    - _Preservation: Manual input, product search, navigation remain functional_
    - _Requirements: 2.1_

  - [~] 8.2 Implement scanning overlay with animation
    - Add animated scanning line that moves vertically
    - Add corner frame guides for barcode positioning
    - Make overlay visually clean and native-like
    - _Bug_Condition: input.visibleControlCount > 2 AND input.userFeedback = "cluttered"_
    - _Expected_Behavior: Clean overlay with animated guide, minimal controls_
    - _Requirements: 2.2_

  - [~] 8.3 Simplify scanner controls
    - Remove zoom slider (use auto-focus)
    - Keep only close button and torch toggle
    - Position controls at bottom with safe area padding
    - Add semi-transparent background for visibility
    - _Bug_Condition: input.visibleControlCount > 2_
    - _Expected_Behavior: Maximum 2 visible controls (close + torch)_
    - _Requirements: 2.2_

  - [~] 8.4 Add CSS styles for fullscreen scanner
    - Add `.scanner-fullscreen` class in index.css
    - Add `.scanner-overlay` and `.scanner-controls` styles
    - Add `@keyframes scanLine` for scanning animation
    - Add safe area handling with `env(safe-area-inset-*)`
    - _Requirements: 2.1, 2.2_

  - [~] 8.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Fullscreen Camera Preview
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms UI is now fullscreen)
    - _Requirements: 2.1, 2.2_

  - [~] 8.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Navigation and Input
    - Run preservation tests from tasks 4-7
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm navigation, product search, manual input still work

---

## Phase 4: Implementation - Phase 2 Quagga2 Optimization

- [ ] 9. Fix for Quagga2 Configuration - Small Barcode Detection
  - [~] 9.1 Update Quagga2 input stream constraints
    - Change width to `{ min: 1280, ideal: 1920 }`
    - Change height to `{ min: 720, ideal: 1080 }`
    - Change aspectRatio to `{ min: 1, max: 2 }` (more flexible)
    - _Bug_Condition: input.quaggaConfig.halfSample = true AND input.barcodeSize = "small"_
    - _Expected_Behavior: Higher resolution for better small barcode detection_
    - _Requirements: 2.5, 2.6_

  - [~] 9.2 Update Quagga2 locator configuration
    - Change `patchSize` from "medium" to "small"
    - Change `halfSample` from `true` to `false`
    - Enable `locate: true` for better locator
    - _Bug_Condition: input.barcodeSize = "small" AND input.quaggaConfig.patchSize IN ["medium", "large"]_
    - _Expected_Behavior: Optimal configuration for small barcode detection_
    - _Requirements: 2.5, 2.6_

  - [~] 9.3 Update Quagga2 frequency and workers
    - Change `frequency` from 10 to 20 (more responsive)
    - Cap `numOfWorkers` to `Math.min(navigator.hardwareConcurrency || 2, 4)`
    - _Bug_Condition: input.detectionTime > 3000_
    - _Expected_Behavior: Detection time < 2 seconds_
    - _Requirements: 2.3_

  - [~] 9.4 Update decoder configuration
    - Reorder readers: prioritize "ean_reader" first for cosmetics
    - Set `multiple: false` for single barcode mode (faster)
    - _Bug_Condition: Detection slow or fails for cosmetic barcodes_
    - _Expected_Behavior: Fast and accurate EAN detection_
    - _Requirements: 2.3, 2.5_

  - [~] 9.5 Add detection confidence filtering
    - Check `data.codeResult` has valid error level
    - Filter detections with high error count
    - Add debounce for rapid detections (prevent duplicate navigations)
    - _Bug_Condition: False positives or duplicate detections_
    - _Expected_Behavior: Accurate single detection per barcode_
    - _Requirements: 2.3_

  - [~] 9.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Optimized Quagga2 Config
    - Run bug condition exploration test from step 2
    - **EXPECTED OUTCOME**: Test PASSES (confirms config is optimized)
    - _Requirements: 2.3, 2.5, 2.6_

  - [~] 9.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Navigation After Detection
    - Run preservation tests from tasks 4-7
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

---

## Phase 5: Implementation - Phase 3 Cross-Platform Fixes

- [ ] 10. Fix for iOS Safari Compatibility
  - [~] 10.1 Add video ready state check before Quagga init
    - Check `video.readyState >= 3` (HAVE_FUTURE_DATA) before Quagga.init()
    - Add event listener for `canplay` if video not ready
    - _Bug_Condition: input.platform = "iOS" AND input.videoReadyState < 3_
    - _Expected_Behavior: Quagga initializes only when video is ready_
    - _Requirements: 2.4_

  - [~] 10.2 Add retry mechanism for Quagga initialization
    - Implement retry with exponential backoff (max 3 retries)
    - Add proper error handling for iOS-specific errors
    - _Bug_Condition: input.platform = "iOS" AND input.detectionResult = null_
    - _Expected_Behavior: Successful initialization on iOS_
    - _Requirements: 2.4_

  - [~] 10.3 Add iOS user gesture handling
    - Ensure scanner starts from user gesture (button click)
    - Add workaround for iOS autoplay restrictions
    - _Bug_Condition: iOS requires user gesture for media playback_
    - _Expected_Behavior: Scanner works after user taps "Mulai Scan"_
    - _Requirements: 2.4_

  - [~] 10.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - iOS Compatibility
    - Run bug condition exploration test from step 3
    - **EXPECTED OUTCOME**: Test PASSES (confirms iOS handling exists)
    - _Requirements: 2.4_

  - [~] 10.5 Verify preservation tests still pass
    - **Property 2: Preservation** - All preserved behaviors
    - Run all preservation tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [ ] 11. Fix for Android Chrome Optimization
  - [~] 11.1 Improve camera selection with deviceId fallback
    - Enumerate cameras with `navigator.mediaDevices.enumerateDevices()`
    - Select back camera by deviceId if `facingMode: "environment"` fails
    - Store selected deviceId for session
    - _Bug_Condition: Wrong camera selected on some Android devices_
    - _Expected_Behavior: Back camera is always selected_
    - _Requirements: 2.3_

  - [~] 11.2 Add worker fallback for environments without support
    - Check if Web Workers are supported before setting `numOfWorkers`
    - Fallback to `numOfWorkers: 0` if Workers not available
    - _Bug_Condition: Web Workers may not work on all mobile browsers_
    - _Expected_Behavior: Scanner works with or without Workers_
    - _Requirements: 2.3_

  - [~] 11.3 Verify Android performance improvement
    - Test detection time on Android device
    - Confirm detection time < 2 seconds for small barcodes
    - _Bug_Condition: input.platform = "Android" AND input.detectionTime > 3000_
    - _Expected_Behavior: Detection time < 2 seconds_
    - _Requirements: 2.3_

---

## Phase 6: Implementation - Phase 4 Enhanced UX

- [ ] 12. Fix for Enhanced User Experience
  - [~] 12.1 Add visual scanning animation
    - Implement animated scan line moving vertically
    - Add pulsing effect on scanning area
    - _Bug_Condition: No visual feedback during scanning_
    - _Expected_Behavior: User sees scanning is active_
    - _Requirements: 2.2_

  - [~] 12.2 Add haptic feedback on barcode detected
    - Use `navigator.vibrate(100)` for haptic feedback
    - Trigger on successful barcode detection
    - Check for vibration API support before using
    - _Bug_Condition: No feedback when barcode detected_
    - _Expected_Behavior: User feels vibration on detection_
    - _Requirements: 2.2_

  - [~] 12.3 Add success state animation
    - Flash green overlay briefly on detection
    - Show detected barcode in overlay
    - Smooth transition to return form page
    - _Bug_Condition: Jarring transition after detection_
    - _Expected_Behavior: Smooth visual transition_
    - _Requirements: 2.2_

  - [~] 12.4 Add loading state during initialization
    - Show loading spinner while camera initializes
    - Display "Memulai kamera..." text
    - Hide spinner once scanning is live
    - _Bug_Condition: No feedback during camera startup_
    - _Expected_Behavior: User sees initialization progress_
    - _Requirements: 2.2_

  - [~] 12.5 Verify all tests pass
    - Run all exploration tests (should pass)
    - Run all preservation tests (should pass)
    - **EXPECTED OUTCOME**: All tests PASS
    - _Requirements: All_

---

## Phase 7: Checkpoint

- [~] 13. Checkpoint - Ensure all tests pass
  - Ensure all exploration tests pass (bugs are fixed)
  - Ensure all preservation tests pass (no regressions)
  - Manual testing on iOS Safari (if device available)
  - Manual testing on Android Chrome (if device available)
  - Test small barcode detection (cosmetic products)
  - Verify UI is fullscreen and clean
  - Ask the user if questions arise

---

## Summary

**Total Tasks**: 13 main tasks with sub-tasks
**Priority Order**: Phase 1 (UI) → Phase 2 (Quagga) → Phase 3 (Cross-platform) → Phase 4 (UX)

**Key Bug Fixes Addressed**:
1. ✅ UI not fullscreen/native-like (Requirements 2.1, 2.2)
2. ✅ Slow detection on Android (Requirements 2.3, 2.6)
3. ✅ No detection on iOS (Requirements 2.4, 2.6)
4. ✅ Small barcode detection failure (Requirements 2.5, 2.6)

**Preserved Behaviors**:
- Navigation to return form (Requirement 3.1)
- Product search dropdown (Requirement 3.2)
- Manual barcode input (Requirement 3.4)
- Stop scanner functionality (Requirement 3.3)
- Error handling messages (Requirement 3.5)
