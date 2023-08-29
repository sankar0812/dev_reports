const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const repositories = require('./config/repo.info.json')

const reposDirectory = 'repos';
const reportsDirectory = 'reports'

if (!fs.existsSync(reportsDirectory)) {
    execSync(`mkdir ${reportsDirectory}`)
}

if (fs.existsSync(reposDirectory)) {
    console.log("===== DELETING EXISTING REPOS. PLEASE WAIT... =====")
    execSync(`rmdir /s /q ${reposDirectory}`);
    console.log("===== DELETED EXISTING REPOS =====")
}

repositories.forEach(repo => {
    if (repo.IsEnabled) {
        const repoName = repo.RepoURL.split('/').pop().replace('.git', '');
        const repoFolderPath = path.join(reposDirectory, repoName);
        const cloneCommand = `git clone ${repo.RepoURL} --branch ${repo.RepoBranch} ${repoFolderPath}`;

        try {
            execSync(cloneCommand);
            console.log(`===== Repository '${repoName}' cloned successfully in '${repoFolderPath}' =====`);

            // Copy reportgenerator.js to the cloned repository
            const sourceFilePath = path.join(__dirname, 'reportgenerator.js');
            const destinationFilePath = path.join(repoFolderPath, 'reportgenerator.js');
            fs.copyFileSync(sourceFilePath, destinationFilePath);
            console.log(`===== reportgenerator.js copied to '${repoName}' repository. =====`);

            // Install exceljs package locally within the cloned repository
            try {
                console.log(`===== Installing Excel JS Locally in '${repoName}' repository. Please wait... =====`);
                execSync('npm install exceljs', { cwd: repoFolderPath });
                console.log(`===== Installed Excel JS Successfully in '${repoName}' repository. =====`);

                // Execute reportgenerator.js in the cloned repository
                const reportGeneratorCommand = `cd ${repoFolderPath} && node reportgenerator.js`;
                execSync(reportGeneratorCommand);
                console.log(`===== reportgenerator.js executed in '${repoName}' repository. =====`);
            } catch (error) {
                console.error(`Error installing or executing reportgenerator.js in '${repoName}' repository:`, error.message);
            }
        } catch (error) {
            console.error(`Error cloning repository '${repoName}':`, error.message);
        }
    }
});
