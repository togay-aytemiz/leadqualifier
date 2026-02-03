const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const projectRoot = process.cwd()
const srcRoot = path.join(projectRoot, 'src')
const enPath = path.join(projectRoot, 'messages', 'en.json')
const trPath = path.join(projectRoot, 'messages', 'tr.json')

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function flattenKeys(obj, prefix = '') {
    const keys = []
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            keys.push(...flattenKeys(value, next))
        } else {
            keys.push(next)
        }
    }
    return keys
}

function checkTranslationParity() {
    const en = readJson(enPath)
    const tr = readJson(trPath)

    const enKeys = new Set(flattenKeys(en))
    const trKeys = new Set(flattenKeys(tr))

    const missingInTr = [...enKeys].filter((key) => !trKeys.has(key))
    const missingInEn = [...trKeys].filter((key) => !enKeys.has(key))

    if (missingInTr.length > 0 || missingInEn.length > 0) {
        console.error('Translation key mismatch detected.')
        if (missingInTr.length > 0) {
            console.error('Missing in tr.json:')
            missingInTr.forEach((key) => console.error(`  - ${key}`))
        }
        if (missingInEn.length > 0) {
            console.error('Extra keys in tr.json (missing in en.json):')
            missingInEn.forEach((key) => console.error(`  - ${key}`))
        }
        return false
    }

    return true
}

const TECHNICAL_ATTRS = new Set([
    'className',
    'id',
    'key',
    'href',
    'src',
    'type',
    'name',
    'value',
    'method',
    'action',
    'role',
    'tabIndex',
    'target',
    'rel',
    'style',
    'width',
    'height',
    'viewBox',
    'fill',
    'stroke',
    'strokeWidth',
    'strokeLinecap',
    'strokeLinejoin',
    'd',
    'cx',
    'cy',
    'x',
    'y',
    'x1',
    'x2',
    'y1',
    'y2',
    'r',
    'rx',
    'ry',
    'offset',
    'stopColor',
    'stopOpacity',
    'points',
    'preserveAspectRatio',
    'xmlns',
    'xmlnsXlink',
    'xlinkHref',
    'as',
    'asChild',
    'variant',
    'size',
    'color',
    'icon',
    'align',
    'direction',
])

const USER_FACING_ATTRS = new Set([
    'title',
    'placeholder',
    'label',
    'alt',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'aria-valuetext',
    'description',
    'helpertext',
    'caption',
    'confirmtext',
    'canceltext',
    'submittext',
    'emptytext',
    'errortext',
    'tooltip',
    'message',
    'text',
    'hint',
    'prompt',
])

const USER_FACING_PATTERN = /(label|title|placeholder|description|text|message|error|hint|helper|caption|tooltip)/i

function isUserFacingAttribute(attrName) {
    if (!attrName) return false
    const normalized = attrName.toString()
    const lower = normalized.toLowerCase()

    if (TECHNICAL_ATTRS.has(normalized) || TECHNICAL_ATTRS.has(lower)) return false
    if (lower.startsWith('data-')) return false

    if (lower.startsWith('aria-')) return true
    if (USER_FACING_ATTRS.has(lower)) return true
    return USER_FACING_PATTERN.test(lower)
}

function containsLetters(text) {
    return /\p{L}/u.test(text)
}

function collectFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...collectFiles(fullPath))
        } else if (entry.isFile()) {
            if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
                files.push(fullPath)
            }
        }
    }
    return files
}

function reportIssue(issues, filePath, sourceFile, node, message) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    issues.push({
        filePath,
        line: line + 1,
        column: character + 1,
        message,
    })
}

function checkHardcodedStrings() {
    const files = collectFiles(srcRoot)
    const issues = []

    for (const filePath of files) {
        const sourceText = fs.readFileSync(filePath, 'utf8')
        const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind)

        function visit(node) {
            if (ts.isJsxText(node)) {
                const text = node.getText()
                const trimmed = text.replace(/\s+/g, ' ').trim()
                if (trimmed && containsLetters(trimmed)) {
                    reportIssue(issues, filePath, sourceFile, node, `Hardcoded JSX text: "${trimmed}"`)
                }
            }

            if (ts.isJsxExpression(node)) {
                if (node.expression && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))) {
                    if (!ts.isJsxAttribute(node.parent)) {
                        const value = node.expression.text.trim()
                        if (value && containsLetters(value)) {
                            reportIssue(issues, filePath, sourceFile, node, `Hardcoded JSX expression string: "${value}"`)
                        }
                    }
                }
            }

            if (ts.isJsxAttribute(node) && node.initializer) {
                const attrName = node.name.getText(sourceFile)

                if (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
                    const value = node.initializer.text.trim()
                    if (value && containsLetters(value) && isUserFacingAttribute(attrName)) {
                        reportIssue(issues, filePath, sourceFile, node, `Hardcoded JSX attribute "${attrName}": "${value}"`)
                    }
                }

                if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
                    const expr = node.initializer.expression
                    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
                        const value = expr.text.trim()
                        if (value && containsLetters(value) && isUserFacingAttribute(attrName)) {
                            reportIssue(issues, filePath, sourceFile, node, `Hardcoded JSX attribute "${attrName}": "${value}"`)
                        }
                    }
                }
            }

            if (ts.isCallExpression(node)) {
                if (ts.isIdentifier(node.expression)) {
                    const fn = node.expression.text
                    if (['alert', 'confirm', 'prompt'].includes(fn)) {
                        const [firstArg] = node.arguments
                        if (firstArg && (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg))) {
                            const value = firstArg.text.trim()
                            if (value && containsLetters(value)) {
                                reportIssue(issues, filePath, sourceFile, node, `Hardcoded ${fn}() message: "${value}"`)
                            }
                        }
                    }
                }
            }

            ts.forEachChild(node, visit)
        }

        visit(sourceFile)
    }

    if (issues.length > 0) {
        console.error('Hardcoded UI strings detected:')
        for (const issue of issues) {
            console.error(`- ${issue.filePath}:${issue.line}:${issue.column} ${issue.message}`)
        }
        return false
    }

    return true
}

const translationOk = checkTranslationParity()
const uiStringsOk = checkHardcodedStrings()

if (!translationOk || !uiStringsOk) {
    process.exit(1)
}

console.log('i18n checks passed.')
