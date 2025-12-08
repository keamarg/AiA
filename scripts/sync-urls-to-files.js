#!/usr/bin/env node

/**
 * Script to sync file names with navigation URLs
 * When a URL changes in navigation.json, this script will:
 * 1. Find the corresponding file based on URL path
 * 2. Rename it to match the new URL
 * 3. Update any references in content files
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync, mkdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { dirname as pathDirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);
const rootDir = join(__dirname, "..");

// Read navigation.json
const navPath = join(rootDir, "src/_data/navigation.json");
const navigation = JSON.parse(readFileSync(navPath, "utf8"));

// Extract all URLs from navigation recursively
function extractUrls(items) {
  const urls = [];
  items.forEach((item) => {
    if (item.url && item.url !== "/") {
      // Convert URL to expected file path
      // URL format: /section/page/ -> src/section/page.md
      const urlPath = item.url.replace(/^\//, "").replace(/\/$/, "");
      const parts = urlPath.split("/");
      
      if (parts.length >= 2) {
        const section = parts[0];
        const page = parts.slice(1).join("/");
        const expectedFile = join(rootDir, "src", section, page + ".md");
        const expectedDir = dirname(expectedFile);
        
        urls.push({
          label: item.label,
          url: item.url,
          section: section,
          page: page,
          expectedFile: expectedFile,
          expectedDir: expectedDir,
        });
      }
    }
    if (item.children) {
      urls.push(...extractUrls(item.children));
    }
  });
  return urls;
}

const allUrls = extractUrls(navigation.items);

// Find existing files in a directory
function findFilesInDir(dir) {
  if (!existsSync(dir)) return [];
  
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  
  entries.forEach((entry) => {
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") {
      const filePath = join(dir, entry.name);
      let title = null;
      
      // Try to read the title from frontmatter
      try {
        const content = readFileSync(filePath, "utf8");
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
          if (titleMatch) {
            title = titleMatch[1].trim().replace(/^["']|["']$/g, "");
          }
        }
      } catch (e) {
        // Ignore errors reading file
      }
      
      files.push({
        path: filePath,
        slug: entry.name.replace(".md", ""),
        name: entry.name,
        title: title,
      });
    }
  });
  return files;
}

const changes = [];

// Process each URL
allUrls.forEach((urlInfo) => {
  const expectedFile = urlInfo.expectedFile;
  const expectedDir = urlInfo.expectedDir;
  
  // Check if file already exists at expected location
  if (existsSync(expectedFile)) {
    // File already matches - nothing to do
    return;
  }
  
  // Find files in the expected directory
  const filesInDir = findFilesInDir(expectedDir);
  
  if (filesInDir.length === 0) {
    console.warn(`⚠️  No file found for URL: ${urlInfo.url} (expected: ${basename(expectedFile)})`);
    return;
  }
  
  // Try to find the matching file
  let fileToRename = null;
  
  if (filesInDir.length === 1) {
    // Only one file - use it
    fileToRename = filesInDir[0];
  } else {
    // Multiple files - try to match by title/label
    const matchingFile = filesInDir.find(f => 
      f.title && f.title.toLowerCase() === urlInfo.label.toLowerCase()
    );
    
    if (matchingFile) {
      fileToRename = matchingFile;
      console.log(`   Matched file by title: ${basename(matchingFile.path)} (title: "${matchingFile.title}")`);
    } else {
      // No title match - check if expected file name matches any existing file slug
      const slugMatch = filesInDir.find(f => f.slug === urlInfo.page);
      if (slugMatch) {
        // File already has the correct name, just in wrong location or something
        return;
      }
      
      // Last resort: warn user
      console.warn(`⚠️  Multiple files found in ${expectedDir} for URL: ${urlInfo.url}`);
      console.warn(`   Label: "${urlInfo.label}"`);
      console.warn(`   Files: ${filesInDir.map(f => `${f.name}${f.title ? ` (title: "${f.title}")` : ""}`).join(", ")}`);
      console.warn(`   Expected: ${basename(expectedFile)}`);
      console.warn(`   Cannot auto-rename - please rename manually or ensure file title matches label`);
      return;
    }
  }
  
  // Rename the file if needed
  if (fileToRename && fileToRename.path !== expectedFile) {
    console.log(`Renaming: ${basename(fileToRename.path)} -> ${basename(expectedFile)}`);
    
    // Ensure directory exists
    if (!existsSync(expectedDir)) {
      mkdirSync(expectedDir, { recursive: true });
    }
    
    // Rename file
    renameSync(fileToRename.path, expectedFile);
    
    changes.push({
      oldPath: fileToRename.path,
      newPath: expectedFile,
      url: urlInfo.url,
      oldSlug: fileToRename.slug,
      newSlug: urlInfo.page,
      section: urlInfo.section,
    });
  }
});

// Update references to old URLs in content files
function updateReferences(oldSlug, newSlug, oldUrl, newUrl) {
  const contentDirs = [
    join(rootDir, "src/om-projektet"),
    join(rootDir, "src/aia-forlob"),
    join(rootDir, "src/begreber-og-fokusomraader"),
    join(rootDir, "src/produkter"),
  ];
  
  let updatedCount = 0;
  
  contentDirs.forEach((dir) => {
    if (!existsSync(dir)) return;
    
    const files = findFilesInDir(dir);
    files.forEach((file) => {
      let content = readFileSync(file.path, "utf8");
      let modified = false;
      
      // Update URL references in content (handles both relative and absolute)
      const oldUrlPattern = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const urlRegex = new RegExp(oldUrlPattern, "g");
      
      if (urlRegex.test(content)) {
        content = content.replace(urlRegex, newUrl);
        modified = true;
      }
      
      // Also check for full URLs with domain
      const fullUrlRegex = new RegExp(
        `(https?://[^/]+)?${oldUrlPattern}`,
        "g"
      );
      if (fullUrlRegex.test(content)) {
        content = content.replace(fullUrlRegex, (match, domain) => {
          return domain ? `${domain}${newUrl}` : newUrl;
        });
        modified = true;
      }
      
      if (modified) {
        writeFileSync(file.path, content, "utf8");
        console.log(`   Updated references in: ${basename(file.path)}`);
        updatedCount++;
      }
    });
  });
  
  return updatedCount;
}

// Update references for all changes
changes.forEach((change) => {
  // Extract old URL from old path
  const oldUrl = `/${change.section}/${change.oldSlug}/`;
  
  const updated = updateReferences(
    change.oldSlug,
    change.newSlug,
    oldUrl,
    change.url
  );
  
  if (updated > 0) {
    console.log(`   Updated ${updated} file(s) referencing old URL`);
  }
});

if (changes.length > 0) {
  console.log(`\n✅ Synced ${changes.length} file(s) to match navigation URLs`);
  console.log(`\n⚠️  Remember to rebuild: npm run build`);
} else {
  console.log("✅ All files already match navigation URLs");
}
