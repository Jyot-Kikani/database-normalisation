#include <bits/stdc++.h>
using namespace std;

string DecToBin(int n)
{
    string ans = "";
    int k = 10;
    while (k--)
    {
        ans += (n % 2 + '0');
        n /= 2;
    }
    reverse(ans.begin(), ans.end());
    return ans;
}
bool check_clouser(int mask, int n, const vector<vector<vector<int>>> &dep)
{
    int taken = mask;

    bool chg = true;
    while (chg)
    {
        chg = false;
        for (int i = 0; i < n; i++)
            if (!(taken & (1 << i)))
            {
                for (auto it : dep[i])
                {
                    if (all_of(it.begin(), it.end(), [&](int a)
                               { return taken & (1 << a); }))
                    {
                        chg = true;
                        taken |= (1 << i);
                        break;
                    }
                }
            }
    }
    return taken == (1 << n) - 1;
}

int vector_to_mask(const vector<int> &vec)
{
    int mask = 0;
    for (int i : vec)
        mask |= (1 << i);
    return mask;
}
vector<int> mask_to_vector_mini(int mask, int n)
{
    vector<int> x;
    for (int i = 0; i < n; i++)
        if (mask & (1 << i))
            x.push_back(i);
    return x;
}
vector<vector<int>> mask_to_vector(const vector<int> &vec, int n)
{
    vector<vector<int>> x;
    for (int msk : vec)
        x.push_back(mask_to_vector_mini(msk, n));
    return x;
}

vector<int> find_sk_mask(int n, const vector<vector<vector<int>>> &dep)
{
    vector<int> sk_mask;
    for (int i = 0; i < (1 << n); i++)
    {
        if (check_clouser(i, n, dep))
            sk_mask.push_back(i);
    }

    return sk_mask;
}
// a b c d e f 
// 0 1 2 3 4 5

vector<int> find_ck_mask(const vector<int> &sk_mask)
{
    vector<int> ck_mask;
    for (int msk : sk_mask)
    {
        if (all_of(sk_mask.begin(), sk_mask.end(), [&](int a)
                   { return a == msk || a != (msk & a); }))
            ck_mask.push_back(msk);
    }
    return ck_mask;
}

int main()
{

    int n, fd_cnt;
    cout << "Enter Number of Columns : ";
    cin >> n;
    cout << "Enter Number of Functional Dependencies :";
    cout << "[given fd are non-trivial cover ] << endl";
    cin >> fd_cnt;

    vector<vector<vector<int>>> dep(n);
    // map<vector<int>, vector<int>> fd;
    vector<pair<vector<int>, int>> fd;

    cout << "Enter FDs :";

    for (int i = 0; i < fd_cnt; i++)
    {
        vector<int> l, r;
        int x;
        cin >> x;
        while (x != -1)
            l.push_back(x), cin >> x;
        cin >> x;

        // fd[l] = r;   
        while (x != -1)
            r.push_back(x), cin >> x;
        for (auto it : r)
            dep[it].push_back(l), fd.push_back({l, it});
    }
    vector<int> sk_mask = find_sk_mask(n, dep);
    vector<vector<int>> sk = mask_to_vector(sk_mask, n);
    vector<int> ck_mask = find_ck_mask(sk_mask);
    vector<vector<int>> ck = mask_to_vector(ck_mask, n);

    cout << "Super Key Mask :" << endl;
    for (auto it : sk_mask)
        cout << it << "\t" << DecToBin(it) << endl;
    cout << "Super Key : " << endl;
    for (auto it : sk)
    {
        for (auto i : it)
            cout << i << " ";
        cout << endl;
    }
    cout << "Candidate Key Mask : " << endl;
    for (int it : ck_mask)
        cout << it << "\t" << DecToBin(it) << endl;
    cout << "Candidate Key :" << endl;
    for (vector<int> it : ck)
    {
        for (int i : it)
            cout << i << ' ';
        cout << endl;
    }

    int prime = 0, non_prime = 0;
    for (vector<int> it : ck)
        for (int i : it)
            prime |= (1 << i);
    for (int i = 0; i < n; i++)
        if (!(prime & (1 << i)))
            non_prime |= (1 << i);
    assert((prime & non_prime) == 0);
    vector<int> fd_pd_status(fd.size(), 0);   // 1 -> partial dep , 0-> no partial dep
    vector<int> fd_td_status(fd.size(), 0);   // 1 -> transitive dep , 0-> no transitive dep
    vector<int> fd_bcnf_status(fd.size(), 0); // 1 -> transitive dep , 0-> no transitive dep

    for (int i = 0; i < fd.size(); i++)
    {
        if (non_prime & (1 << fd[i].second))
        {
            // fd is proper subset of any ck
            int curr_msk = vector_to_mask(fd[i].first);
            fd_pd_status[i] = any_of(ck_mask.begin(), ck_mask.end(), [&](int a)
                                     { return a != curr_msk && (a & curr_msk) == curr_msk; });
            if (!fd_pd_status[i])
                fd_td_status[i] = all_of(sk_mask.begin(), sk_mask.end(), [&](int a)
                                         { return a != curr_msk; });
            else
                fd_td_status[i] = -1;
        }
        if (!fd_pd_status[i] && !fd_td_status[i])
        {
            int curr_maskk = vector_to_mask(fd[i].first);
            fd_bcnf_status[i] = all_of(sk_mask.begin(), sk_mask.end(), [&](int a)
                                       { return a != curr_maskk; });
        }
        else
            fd_bcnf_status[i] = -1;
    }

    cout << "Functional Dependencies : " << endl;
    for (int i = 0; i < fd.size(); i++)
    {
        for (auto i : fd[i].first)
            cout << i << ' ';
        cout << "-> " << fd[i].second << " | " << fd_pd_status[i] << " | " << fd_td_status[i] << " | " << fd_bcnf_status[i] << endl;
    }

    /************************ */
    int main = (1 << n) - 1;
    cout << "1N Form :" << endl;
    vector<int> x = mask_to_vector_mini(main, n);
    for (int i : x)
        cout << i << ' ';
    cout << endl;

    //************************* */
    cout << "2N Form :" << endl;
    map<int, int> tables;
    for (int i = 0; i < fd.size(); i++)
        if (fd_pd_status[i] == 1)
        {
            int ll = vector_to_mask(fd[i].first);
            tables[ll] |= (1 << fd[i].second);
            main &= ~(1 << fd[i].second);
        }
    x = mask_to_vector_mini(main, n);
    for (int i : x)
        cout << i << " ";
    cout << endl;
    for (auto it : tables)
    {
        vector<int> pk = mask_to_vector_mini(it.first, n);
        vector<int> rr = mask_to_vector_mini(it.second, n);
        for (int i : pk)
            cout << i << ' ';
        cout << "| ";
        for (int i : rr)
            cout << i << " ";
        cout << endl;
    }

    cout << "3N Form :" << endl;
    for (int i = 0; i < fd.size(); i++)
        if (fd_td_status[i] == 1)
        {
            int ll = vector_to_mask(fd[i].first);
            tables[ll] |= (1 << fd[i].second);
            main &= ~(1 << fd[i].second);
        }
    x = mask_to_vector_mini(main, n);
    for (int i : x)
        cout << i << " ";
    cout << endl;
    for (auto it : tables)
    {
        vector<int> pk = mask_to_vector_mini(it.first, n);
        vector<int> rr = mask_to_vector_mini(it.second, n);
        for (int i : pk)
            cout << i << ' ';
        cout << "| ";
        for (int i : rr)
            cout << i << " ";
        cout << endl;
    }

    cout << "BCNF :" << endl;
    for (int i = 0; i < n; i++)
        if (fd_bcnf_status[i] == 1)
        {
            int ll = vector_to_mask(fd[i].first);
            tables[ll] |= (1 << fd[i].second);
            main &= ~(1 << fd[i].second);
        }
    x = mask_to_vector_mini(main, n);
    for (int i : x)
        cout << i << " ";
    cout << endl;
    for (auto it : tables)
    {
        vector<int> pk = mask_to_vector_mini(it.first, n);
        vector<int> rr = mask_to_vector_mini(it.second, n);
        for (int i : pk)
            cout << i << ' ';
        cout << "| ";
        for (int i : rr)
            cout << i << " ";
        cout << endl;
    }
    return 0;
}