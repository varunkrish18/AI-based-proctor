"""
Configuration thresholds for computer vision analysis.
Named constants as required by Phase 5 spec.
"""

# Confidence threshold for face presence
FACE_DETECTION_CONFIDENCE = 0.5

# Object detection confidence threshold for mobile phones & prohibited devices
PHONE_DETECTION_CONFIDENCE = 0.55
OBJECT_DETECTION_CONFIDENCE = 0.50

# Recognized prohibited object categories from COCO detector
PROHIBITED_OBJECT_CATEGORIES = {
    "cell phone", "phone", "book", "laptop", "remote", "tv", "tablet"
}

# Head pose angle thresholds (in degrees)
# Looking left/right yaw threshold (moderate turn away from screen)
YAW_LOOK_AWAY_DEG = 22.0
# Distinct head turn threshold
YAW_HEAD_TURNED_DEG = 32.0

# Pitch looking down/up thresholds (in degrees)
# Looking up towards ceiling: 18.0 degrees
# Looking down at lap/notes/phone: 18.0 degrees (allows normal reading of questions on screen)
PITCH_LOOK_UP_DEG = 18.0
PITCH_LOOK_DOWN_DEG = 18.0

# Iris gaze displacement ratio thresholds (relative to eye corners)
# Center gaze spans 0.25 to 0.75 horizontally
IRIS_HORIZONTAL_RIGHT_RATIO = 0.25
IRIS_HORIZONTAL_LEFT_RATIO = 0.75

# Vertical iris gaze ratios (y increases downwards in image coordinates)
# Normal resting pupil center is ~0.35 - 0.45 relative to upper eyelid
# > 0.70 means iris is rolled downwards towards lower eyelid (looking down at desk/lap)
# < 0.22 means iris is rolled upwards towards upper eyelid (looking up at ceiling)
IRIS_VERTICAL_DOWN_RATIO = 0.70
IRIS_VERTICAL_UP_RATIO = 0.22


