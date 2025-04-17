# Simple S3 Web Application to upload multiple files
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## About
This repository contains the Open Source Software to demonstrate how to build a simple WebApp to users upload files to S3.  

### Built With

- [AWS Amplify Framework](https://docs.amplify.aws/)
- [Amazon S3](https://aws.amazon.com/s3/)
- [Amazon Cognito](https://aws.amazon.com/cognito/)
- [AWS UI](https://github.com/aws/awsui-documentation)
- [Node.JS](https://nodejs.org/en/)
- [React](https://reactjs.org/)

## Getting Started
Clone the source code repository using below command from your terminal and navigate to the root of your app directory.  
`git clone https://github.com/sdevsrm/s3upload-ui-custom.git`  
`cd s3upload-ui-custom/`  

Install AWS Amplify CLI using below command  
`npm install -g @aws-amplify/cli`  

> [!NOTE]
> If `npm` is not installed on your EC2 instance/application server, use the `sudo yum install npm` command to install it.  
> It is recommended to run this command from the root of your app directory. In this example, it is "s3upload-ui-custom."  
> For the next steps, if you receive a deprecation warning messages such as, 'npm WARN deprecated,' or `(node:19991) [DEP0128] DeprecationWarning: Invalid 'main'` just ignore and press enter to continue.


Inside the root directory/project folder, initialize the project by entering below command  
`amplify init`  

&emsp;Select the following parameters:  
    &emsp;&emsp;Enter a name for the project: **s3upload-ui-custom** (it can be any name; if you wish, you can leave defaults). Press enter.  
    &emsp;&emsp;Initialize the project with the above configuration: **Yes**. Press enter.  
    &emsp;&emsp;Select the authentication method you want to use: **AWS profile**. Press Enter.  
    &emsp;&emsp;Please choose the profile you want to use: **default**. Press Enter.  

> [!NOTE]
> If there is no profile configured on your EC2 instance, you need to configure the access key and secret key of your AWS account and create a profile to proceed further.

Add the authentication component  
`amplify add auth`

&emsp;Select the following parameters:  
&emsp;&emsp;For Do you want to use the default authentication and security configuration?, select **Default Configuration**. Press enter.  
&emsp;&emsp;For How do you want users to be able to sign in?, select **Username**. Press enter to confirm.  
&emsp;&emsp;For Do you want to configure advanced settings? Select **No**, I am done.  

Add the storage component  
`amplify add storage`

&emsp;Select the following parameters:  
&emsp;&emsp;For Select from one of the below mentioned services, select **Content (Images, audio, video, etc.).** Press enter to confirm.  
&emsp;&emsp;Provide a friendly name for your resource that will be used to label this category in the project - for example: s35e505e53 **(it can be any name; if you wish, accept the defaults). Press enter.**   
&emsp;&emsp;Provide bucket name. This is the bucket where users will upload files. For example: s3uploaderxxxxx. **The name must be unique; otherwise, accept the defaults suggested and select enter to confirm. Make a note of this bucket; you use it later.**  
&emsp;&emsp;Who should have access: Select **Auth users only**, use arrow key to move between the options and hit enter to select.  
&emsp;&emsp;What kind of access do you want for Authenticated users? Use your arrow key to pick **create/update/delete** and then hit the space bar to select it. Select enter to confirm.  
&emsp;&emsp;Do you want to add Lambda Trigger for your S3 Bucket? Select **No** and press enter to confirm.  

> Select: Content (Images, audio, video, etc.)  
> Provide a label for this category or use the suggested one from the wizard.  
> Select the option create/update/delete from the list of actions  

Add the application hosting  
`amplify hosting add`  

> Select Amazon CloudFront and S3. Define a new unique bucket name or use the suggested one.

Now, you can build the web app (front-end)

```bash
npm install
amplify push
amplify publish
```

The output of the `amplify publish` if all the deployment was done correctly is a URL
This URL is the web application URl where you can open from the browser to access your application.
By default, the front-end come with the sign-up UI disabled and user has to be created manually in the AWS Cognito service.
To enable the sign-up UI you need to change the file: `App.css`

Comment or remove the following block:

```css
.amplify-tabs {
display: none;
}
```
> After this change you need to re-run `amplify publish` or `amplify publish -c`


### Prerequisites

To build this solution you must have:
- AWS account
- Permissions to create resources in the AWS account
- Node.js 16.x or higher

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
