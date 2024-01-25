import fs from 'fs';
import {BUILD_ID_FILE} from 'next/dist/shared/lib/constants';
import path from 'path';

/**
 * Get the current build ID
 */
export default function getBuildId() {
    const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
    try {
        return fs.readFileSync(buildIdPath, 'utf8').trim();
    } catch (err) {
        // console.error('Unable to read BUILD_ID:', err);
        return 'UNKNOWN_BUILD_ID';
    }
}

/**
 * Check if the current build is a preview build
 */
export function checkBuildStage() {
    const key = 'NEXT_PUBLIC_BUILD_STAGE';
    // Use a complex code to avoid Next.js caching the result
    const value = process.env[key] || process.env[`__NEXT_PUBLIC_${key}`];
    if (value === 'true') {
        return true
    }
    return false;
}


/**
 * Check if this is the first time to visit site, if so, rerender the page to avoid stale data
 */
export function isFirstTimeRun() {
    const key = 'NEXT_PUBLIC_FIRST_TIME_RUN';
    // Use a complex code to avoid Next.js caching the result
    const value = process.env[key] || process.env[`__NEXT_PUBLIC_${key}`];
    if (value === 'true') {
        return false
    }
    process.env[key] = 'true';
    return true;
}
