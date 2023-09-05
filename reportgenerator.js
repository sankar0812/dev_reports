const { execSync } = require('child_process');
const ExcelJS = require('exceljs');
const fs = require('fs');

// Specify start and end dates in a readable format (YYYY-MM-DD HH:MM:SS) IN CST
const startDateTimeReadable = '2023-08-04 13:30:00';
const endDateTimeReadable = '2023-08-05 12:59:59';

function findOrCreateSheet(workbook, sheetName) {
    const existingSheet = workbook.getWorksheet(sheetName);
    if (existingSheet) {
        return existingSheet;
    } else {
        return workbook.addWorksheet(sheetName);
    }
}

function parseGitLog(logOutput, startDate, endDate) {
    const authorData = {};
    const authorRegex = /Author:\s+(.+) <(.+)>/;
    const commitRegex = /commit ([a-f0-9]+)/;
    const dateRegex = /Date:\s+(.+)/;
    const insertionsRegex = /(\d+) insertion/;
    const deletionsRegex = /(\d+) deletion/;

    const lines = logOutput.split('\n');
    let currentAuthor = null;
    let currentCommit = null;
    let currentDate = null;

    for (const line of lines) {
        const authorMatch = line.match(authorRegex);
        if (authorMatch) {
            const authorName = authorMatch[1];
            currentAuthor = `${authorName} <${authorMatch[2]}>`;
            if (!authorData[currentAuthor]) {
                authorData[currentAuthor] = {
                    insertions: 0,
                    deletions: 0,
                    lastCommitMessage: '',
                    lastCommitDateTime: null,
                    commitCount: 0 // Initialize commit count
                };
            }
        }

        const commitMatch = line.match(commitRegex);
        if (commitMatch) {
            currentCommit = commitMatch[1];
            if (currentAuthor) {
                if (!authorData[currentAuthor].commitCount) {
                    authorData[currentAuthor].commitCount = 0;
                }
                // Check if commit is within the specified dates
                if (currentDate >= startDate && currentDate <= endDate) {
                    authorData[currentAuthor].commitCount++;
                }
            }
        }

        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
            currentDate = new Date(dateMatch[1]);
            if (currentAuthor && currentDate >= startDate && currentDate <= endDate) {
                authorData[currentAuthor].lastCommitDateTime = currentDate.toISOString();
            }
        }

        const insertionsMatch = line.match(insertionsRegex);
        if (insertionsMatch && currentAuthor && currentDate >= startDate && currentDate <= endDate) {
            const insertions = parseInt(insertionsMatch[1]);
            authorData[currentAuthor].insertions += insertions;
            authorData[currentAuthor].lastCommitMessage = getCommitMessage(currentCommit);
        }

        const deletionsMatch = line.match(deletionsRegex);
        if (deletionsMatch && currentAuthor && currentDate >= startDate && currentDate <= endDate) {
            const deletions = parseInt(deletionsMatch[1]);
            authorData[currentAuthor].deletions += deletions;
            authorData[currentAuthor].lastCommitMessage = getCommitMessage(currentCommit);
        }
    }

    return authorData;
}

function getCommitMessage(commitHash) {
    try {
        const commitMessage = execSync(`git log -n 1 --pretty=format:%s ${commitHash}`).toString().trim();
        return commitMessage;
    } catch (error) {
        return '';
    }
}

function filterAuthorsWithData(authorData) {
    const filteredAuthors = {};
    for (const author in authorData) {
        const { insertions, deletions, lastCommitMessage, lastCommitDateTime, commitCount } = authorData[author];
        if (lastCommitMessage !== '') {
            filteredAuthors[author] = {
                insertions,
                deletions,
                lastCommitMessage,
                lastCommitDateTime,
                commitCount
            };
        }
    }
    return filteredAuthors;
}

function calculateTotalLines(data) {
    const total = {
        insertions: 0,
        deletions: 0
    };
    for (const author in data) {
        total.insertions += data[author].insertions;
        total.deletions += data[author].deletions;
    }
    return total;
}

try {
    // Convert readable dates to JavaScript Date objects
    const startDateTimeCST = new Date(startDateTimeReadable);
    const endDateTimeCST = new Date(endDateTimeReadable);

    const gitLogOutput = execSync('git log --stat').toString();
    const authorLinesData = parseGitLog(gitLogOutput, startDateTimeCST, endDateTimeCST);
    const filteredAuthors = filterAuthorsWithData(authorLinesData);
    const totalLines = calculateTotalLines(filteredAuthors);

    // Print the output
    console.log('Authors:', JSON.stringify(filteredAuthors, null, 2));
    console.log('Total Lines:', totalLines);

    // Get repository name from the Git remote URL
    const gitRemoteURL = execSync('git config --get remote.origin.url').toString().trim();
    const repositoryName = gitRemoteURL.split('/').pop().replace('.git', '');

    // Create a new Excel workbook or load existing workbook
    const formattedStartDateTime = startDateTimeCST.toLocaleString().replace(/[/: ]/g, '-');
    const formattedEndDateTime = endDateTimeCST.toLocaleString().replace(/[/: ]/g, '-');
    const excelFileName = `Dev Status Report ${formattedStartDateTime} - ${formattedEndDateTime}.xlsx`;
    const excelFilePath = `../../reports/${excelFileName}`;
    const workbook = new ExcelJS.Workbook();

    // Load existing workbook if it exists
    if (fs.existsSync(excelFilePath)) {
        workbook.xlsx.readFile(excelFilePath)
            .then(() => {
                const worksheet = findOrCreateSheet(workbook, repositoryName);

                // Add data rows to the worksheet
                for (const author in filteredAuthors) {
                    const { insertions, deletions, lastCommitMessage, lastCommitDateTime, commitCount } = filteredAuthors[author];
                    const formattedLastCommitDate = new Date(lastCommitDateTime).toLocaleString();
                    worksheet.addRow([author, insertions, deletions, lastCommitMessage, formattedLastCommitDate, commitCount || 0]);
                }

                // Save the Excel file
                return workbook.xlsx.writeFile(excelFilePath);
            })
            .then(() => {
                console.log(`Excel file '${excelFilePath}' updated successfully.`);
            })
            .catch(error => {
                console.error('Error updating Excel file:', error.message);
            });
    } else {
        const worksheet = workbook.addWorksheet(repositoryName);

        // Add headers to the worksheet
        worksheet.addRow(['Author', 'Insertions', 'Deletions', 'Last Commit Message', 'Last Commit Date', 'Commit Count']);

        // Add data rows to the worksheet
        for (const author in filteredAuthors) {
            const { insertions, deletions, lastCommitMessage, lastCommitDateTime, commitCount } = filteredAuthors[author];
            const formattedLastCommitDate = new Date(lastCommitDateTime).toLocaleString();
            worksheet.addRow([author, insertions, deletions, lastCommitMessage, formattedLastCommitDate, commitCount || 0]);
        }

        // Save the Excel file
        workbook.xlsx.writeFile(excelFilePath)
            .then(() => {
                console.log(`Excel file '${excelFilePath}' created successfully.`);
            })
            .catch(error => {
                console.error('Error creating Excel file:', error.message);
            });
    }
} catch (error) {
    console.error('Error:', error.message);
}
