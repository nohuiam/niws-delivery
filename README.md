# Claude Home Directory

**Created:** December 22, 2025  
**Purpose:** Safe working directory for Claude Code operations

---

## Folder Structure

- **inbox/** - Drop files here for Claude to process
- **workspace/** - Active working area for Claude operations
- **output/** - Completed work ready for user review
- **archive/** - User-moved completed work (Claude does not write here)

---

## Security Rules

1. Claude Code CANNOT use rm -rf, rm -r, or rm -f anywhere
2. Claude Code CANNOT operate on /Documents root
3. Deletions must be done manually by user in Finder
4. All file operations are logged

---

## For Deletions

Claude will tell you what to delete. You do it yourself:

1. Open Finder
2. Navigate to the file/folder
3. Move to Trash (Command + Delete)

Or in Terminal (not Claude Code):
```bash
trash /path/to/file
```

Install trash command: `brew install trash`

---

## Recovery

Time Machine backup recommended for this folder.
