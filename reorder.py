with open('src/app/dashboard/curriculum/page.tsx', 'r') as f:
    lines = f.readlines()

chunk_a = lines[:2032]
chunk_b = lines[2032:2473] # Delivery and Tools opening + QA spine
chunk_c = lines[2473:2597] # Term tabs, weeks, materials
chunk_d = lines[2597:2603] # The closing tags
chunk_e = lines[2603:] # </main> and beyond

# chunk_d has:
# 2597:                     </div>
# 2598:                   )}
# 2599:                 </div>
# 2600:               )}
# 2601:             </div>
# 2602:           )}

# Syllabus should close with lines 2599, 2600, 2601, 2602
syllabus_close = chunk_d[2:6]

# Tools should close with lines 2597, 2598
tools_close = chunk_d[0:2]

new_lines = chunk_a + chunk_c + syllabus_close + chunk_b + tools_close + chunk_e

with open('src/app/dashboard/curriculum/page.tsx', 'w') as f:
    f.writelines(new_lines)

print("Reordered successfully!")
