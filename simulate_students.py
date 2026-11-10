"""
Simulate 200 concurrent students taking an exam on proctor.campus-notes.in
Uses standard Python threading and requests (no blocked C-extensions or external frameworks).
"""

import sys
import time
import random
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

# Tiny 1x1 dummy jpeg data url to simulate webcam frame uploads
DUMMY_FRAME = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP"
    "//////////////////////////////////////////////////////////"
    "////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAA"
    "AAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)

stats = {
    "verified": 0,
    "started": 0,
    "frames_sent": 0,
    "answers_sent": 0,
    "submitted": 0,
    "rate_limited_429": 0,
    "errors": 0,
}

def run_student_session(student_id: int, base_url: str, exam_id: int, duration_sec: int, test_password: str, run_tag: str):
    email = f"sim_{run_tag}_{student_id:04d}@test.com"
    session = requests.Session()
    session.headers.update({
        "User-Agent": "ProctorLoadTester/1.0",
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
    })

    # Step 1: Verify student
    verify_url = f"{base_url}/api/exams/{exam_id}/verify-student"
    try:
        res = session.post(verify_url, json={"email": email, "password": test_password}, timeout=15)
        if res.status_code == 429:
            stats["rate_limited_429"] += 1
            print(f"❌ Student {student_id:03d}: [429 RATE LIMITED] on verification")
            return
        if res.status_code != 200:
            stats["errors"] += 1
            err_msg = res.json().get("message", res.text) if "application/json" in res.headers.get("Content-Type", "") else res.text
            print(f"⚠️ Student {student_id:03d}: verify status {res.status_code} - {err_msg}")
            return
        
        data = res.json()
        token = data.get("sessionToken")
        if not token:
            stats["errors"] += 1
            print(f"⚠️ Student {student_id:03d}: no token returned ({data.get('message')})")
            return
        
        stats["verified"] += 1
        session.headers["Authorization"] = f"Bearer {token}"
    except Exception as e:
        stats["errors"] += 1
        print(f"❌ Student {student_id:03d}: verify error: {e}")
        return

    # Step 2: Start exam
    start_url = f"{base_url}/api/student/exams/{exam_id}/start"
    try:
        res = session.post(start_url, timeout=15)
        if res.status_code == 429:
            stats["rate_limited_429"] += 1
            return
        if res.status_code != 200:
            stats["errors"] += 1
            try:
                err_msg = res.json().get("message", res.text)
            except Exception:
                err_msg = res.text
            print(f"⚠️ Student {student_id:03d}: start exam status {res.status_code} - {err_msg}")
            return

        start_data = res.json()
        attempt_id = start_data.get("attemptId")
        if not attempt_id:
            stats["errors"] += 1
            return

        stats["started"] += 1
        print(f"✅ Student {student_id:03d} ({email}): Exam Started (Attempt #{attempt_id})")
    except Exception as e:
        stats["errors"] += 1
        print(f"❌ Student {student_id:03d}: start error: {e}")
        return

    # Step 3: Simulate exam activity (webcam frames, answers, heartbeats)
    end_time = time.time() + duration_sec
    while time.time() < end_time:
        time.sleep(random.uniform(2.0, 5.0))
        
        # Upload a webcam frame
        try:
            f_res = session.post(
                f"{base_url}/api/student/attempts/{attempt_id}/proctoring/frame",
                json={"frame": DUMMY_FRAME, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
                timeout=10
            )
            if f_res.status_code == 429:
                stats["rate_limited_429"] += 1
            elif f_res.status_code == 200:
                stats["frames_sent"] += 1
        except Exception:
            pass

        # Send an answer
        try:
            a_res = session.post(
                f"{base_url}/api/student/attempts/{attempt_id}/answers",
                json={"questionId": random.randint(1, 20), "selectedOption": random.choice(["A", "B", "C", "D"])},
                timeout=10
            )
            if a_res.status_code == 200:
                stats["answers_sent"] += 1
        except Exception:
            pass

    # Step 4: Submit exam
    try:
        sub_res = session.post(f"{base_url}/api/student/attempts/{attempt_id}/submit", timeout=15)
        if sub_res.status_code in (200, 204):
            stats["submitted"] += 1
            print(f"🎉 Student {student_id:03d}: Exam Successfully Submitted!")
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Simulate 200 Virtual Students writing an Exam")
    parser.add_argument("--host", default="https://proctor.campus-notes.in", help="Base URL of target system")
    parser.add_argument("--exam", type=int, default=38, help="Exam ID to take")
    parser.add_argument("--students", type=int, default=500, help="Number of virtual students")
    parser.add_argument("--duration", type=int, default=60, help="How many seconds each student writes the exam")
    parser.add_argument("--password", default="OPEN", help="Exam access password (or OPEN if open-to-all)")
    parser.add_argument("--stagger", type=float, default=0.03, help="Seconds to wait between launching each student (default: 0.03s)")
    args = parser.parse_args()

    base_url = args.host.rstrip("/")
    run_tag = hex(int(time.time()))[2:]
    print("=" * 65)
    print(f"🚀 AI Online Examination - {args.students} Student Load Simulator")
    print(f"Target Server : {base_url}")
    print(f"Target Exam ID: {args.exam}")
    print(f"Students Count: {args.students} concurrent virtual students")
    print(f"Exam Duration : {args.duration} seconds per student")
    print(f"Session Tag   : {run_tag}")
    print("=" * 65)

    start_wall_time = time.time()

    # Support up to 1000 concurrent virtual students
    max_workers = min(args.students, 1000)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = []
        for i in range(args.students):
            # Stagger student launch smoothly to avoid TCP SYN connection flood
            if args.stagger > 0:
                time.sleep(args.stagger)
            f = executor.submit(run_student_session, i + 1, base_url, args.exam, args.duration, args.password, run_tag)
            futures.append(f)

        # Wait for all to finish
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                stats["errors"] += 1

    total_time = round(time.time() - start_wall_time, 2)
    print("\n" + "=" * 65)
    print("📊 SIMULATION COMPLETE - SUMMARY REPORT")
    print("=" * 65)
    print(f"⏱️ Total Wall Time       : {total_time}s")
    print(f"👤 Students Verified     : {stats['verified']} / {args.students}")
    print(f"📝 Exams Started         : {stats['started']} / {args.students}")
    print(f"📷 Webcam Frames Handled : {stats['frames_sent']}")
    print(f"✍️ Answers Submitted     : {stats['answers_sent']}")
    print(f"🏁 Exams Completed       : {stats['submitted']} / {args.students}")
    print(f"🚫 429 Rate Limit Hits   : {stats['rate_limited_429']}")
    print(f"⚠️ Other Errors/Failures : {stats['errors']}")
    print("=" * 65)


if __name__ == "__main__":
    main()
