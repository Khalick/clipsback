// This script updates the index.js file to add status field updates
// to deregistration, academic leave, and reregistration endpoints

import fs from 'fs';
import path from 'path';

// Read the index.js file
const indexPath = path.join(process.cwd(), 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

// Update academic leave endpoints
content = content.replace(
  /academic_leave=true,\s+academic_leave_start=\$1,\s+academic_leave_end=\$2,\s+academic_leave_reason=\$3\s+WHERE id=\$4 RETURNING \*/g,
  'academic_leave=true, \n        academic_leave_start=$1, \n        academic_leave_end=$2,\n        academic_leave_reason=$3,\n        status=\'on_leave\' \n      WHERE id=$4 RETURNING *'
);

content = content.replace(
  /academic_leave=true,\s+academic_leave_start=\$1,\s+academic_leave_end=\$2,\s+academic_leave_reason=\$3\s+WHERE registration_number=\$4 RETURNING \*/g,
  'academic_leave=true, \n        academic_leave_start=$1, \n        academic_leave_end=$2,\n        academic_leave_reason=$3,\n        status=\'on_leave\' \n      WHERE registration_number=$4 RETURNING *'
);

// Update deregistration endpoints
content = content.replace(
  /deregistered=true,\s+deregistration_date=\$1,\s+deregistration_reason=\$2\s+WHERE id=\$3 RETURNING \*/g,
  'deregistered=true, \n        deregistration_date=$1, \n        deregistration_reason=$2,\n        status=\'deregistered\' \n      WHERE id=$3 RETURNING *'
);

content = content.replace(
  /deregistered=true,\s+deregistration_date=\$1,\s+deregistration_reason=\$2\s+WHERE registration_number=\$3 RETURNING \*/g,
  'deregistered=true, \n        deregistration_date=$1, \n        deregistration_reason=$2,\n        status=\'deregistered\' \n      WHERE registration_number=$3 RETURNING *'
);

content = content.replace(
  /deregistered=true,\s+deregistration_date=\$1,\s+deregistration_reason=\$2\s+WHERE id = ANY\(\$3\) RETURNING \*/g,
  'deregistered=true, \n          deregistration_date=$1, \n          deregistration_reason=$2,\n          status=\'deregistered\' \n        WHERE id = ANY($3) RETURNING *'
);

content = content.replace(
  /deregistered=true,\s+deregistration_date=\$1,\s+deregistration_reason=\$2\s+WHERE registration_number = ANY\(\$3\) RETURNING \*/g,
  'deregistered=true, \n          deregistration_date=$1, \n          deregistration_reason=$2,\n          status=\'deregistered\' \n        WHERE registration_number = ANY($3) RETURNING *'
);

// Update restore/reregister endpoints
content = content.replace(
  /deregistered=false,\s+deregistration_date=NULL,\s+deregistration_reason=NULL\s+WHERE id=\$1 RETURNING \*/g,
  'deregistered=false, \n        deregistration_date=NULL, \n        deregistration_reason=NULL,\n        status=\'active\' \n      WHERE id=$1 RETURNING *'
);

// Update cancel academic leave endpoints
content = content.replace(
  /academic_leave=false,\s+academic_leave_start=NULL,\s+academic_leave_end=NULL,\s+academic_leave_reason=NULL\s+WHERE id=\$1 RETURNING \*/g,
  'academic_leave=false, \n        academic_leave_start=NULL, \n        academic_leave_end=NULL,\n        academic_leave_reason=NULL,\n        status=\'active\' \n      WHERE id=$1 RETURNING *'
);

// Write the updated content back to the file
fs.writeFileSync(indexPath, content);

console.log('Successfully updated index.js with student status changes');