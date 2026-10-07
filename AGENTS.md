<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use Lovable Cloud for authenticated office data and private client-document storage because the platform contains sensitive legal and financial records.
- Keep the product architecture centered on clients, contracts, generated installments, and private document attachments because these are the office's primary workflows.
- Run personal-document extraction only in authenticated server functions and never log or expose the document contents, because they contain sensitive client data.
- Derive active-process counts from Google Drive folders named with a CNJ process number under each client folder, because Drive is the office's process source of truth.
- Keep the public authentication page limited to email/password sign-in and recovery; account provisioning is managed outside the public UI to protect office access.
- Validate sign-in with Auth's getUser, not a profile activation flag, because provisioned office accounts have no separate approval table.
