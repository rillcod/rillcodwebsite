import os
import sys
import argparse
import subprocess

def run_script(script_name):
    script_path = os.path.join(os.path.dirname(__file__), "scripts", script_name)
    if not os.path.exists(script_path):
        print(f"Error: Script not found at {script_path}")
        return False
    
    print(f"\n==================================================")
    print(f" Executing: {script_name}")
    print(f"==================================================")
    
    # Use py launcher or python
    python_cmd = "py"
    cmd = [python_cmd, script_path]
    
    res = subprocess.run(cmd, capture_output=False)
    if res.returncode == 0:
        print(f"[SUCCESS] {script_name} completed successfully.\n")
        return True
    else:
        print(f"[ERROR] {script_name} failed with exit code {res.returncode}.\n")
        return False

def main():
    parser = argparse.ArgumentParser(description="Generate Rillcod Academy & Bay-Flowers Partnership Documents (Proposal & MOU)")
    parser.add_argument("--type", choices=["proposal", "mou", "all"], default="all", help="Document type to generate (proposal, mou, or all)")
    args = parser.parse_args()

    print("==================================================")
    print(" Rillcod Academy - Partnership Document Generator ")
    print(" Target School: Bay-Flowers International School  ")
    print("==================================================")

    success_count = 0
    total = 0

    if args.type in ["proposal", "all"]:
        total += 1
        if run_script("build_proposal_with_cover_and_curriculum.py"):
            success_count += 1

    if args.type in ["mou", "all"]:
        total += 1
        if run_script("build_master_4page_mou_perfect.py"):
            success_count += 1

    print(f"Completed: {success_count}/{total} document generation task(s).")

if __name__ == "__main__":
    main()
