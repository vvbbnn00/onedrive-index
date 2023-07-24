import fs from 'fs';
import { BUILD_ID_FILE } from 'next/dist/shared/lib/constants';
import path from 'path';

export default function getBuildId() {
    try {
        return fs.readFileSync(path.join('.next', BUILD_ID_FILE), 'utf-8').trim();
    }
    catch (err) {
        return 'Development'
    }
}